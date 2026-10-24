import {describe,it,expect} from 'vitest'
import {conferenceCartridge,type ConferenceState,type ConferenceCommand} from '../src/cartridges/conference'
import {assessReadiness,defaultProductionPlan,rehearse,validateProductionPlan,REQUIRED_SIGNALS,ROUTES} from '../src/conference/planning'

function prepared():ConferenceState{
  const state=conferenceCartridge.initialState()
  const session=state.sessions[0]
  const base=defaultProductionPlan(session)
  const routes={...base.routes}
  for(const key of ROUTES)routes[key]=`Demo ${key} patch`
  const plan={...base,operator:'Demo showcaller',routes}
  return {...state,plans:state.plans.map(p=>p.sessionId===session.id?plan:p),
    signals:REQUIRED_SIGNALS.map(signal=>({roomId:session.roomId,signal,status:'ok' as const,note:'Operator attested in simulated fixture'}))}
}
describe('DC27 executable production planning',()=>{
  it('seeds every demo session with bounded, unassigned SF26-style cue plan',()=>{
    const state=conferenceCartridge.initialState()
    expect(state.plans).toHaveLength(state.sessions.length)
    expect(state.plans.every((plan)=>!plan.operator&&ROUTES.every(key=>!plan.routes[key]))).toBe(true)
    expect(state.plans.every(plan=>validateProductionPlan(plan,state.sessions.find(s=>s.id===plan.sessionId)).length===0)).toBe(true)
    expect(assessReadiness(state,'demo-open').verdict).toBe('blocked')
  })
  it('rejects unknown/malformed plans and edits to live sessions',()=>{
    const state=prepared()
    const plan=state.plans[0]
    expect(conferenceCartridge.validate(state,{type:'SET_SESSION_PLAN',plan:{...plan,sessionId:'missing'},idempotencyKey:'p1'})).toMatchObject({ok:false})
    expect(conferenceCartridge.validate(state,{type:'SET_SESSION_PLAN',plan:{...plan,cues:[...plan.cues].reverse()},idempotencyKey:'p2'})).toMatchObject({ok:false})
    expect(conferenceCartridge.validate(state,{type:'SET_SESSION_PLAN',plan:{...plan,routes:{...plan.routes,asl:47}},idempotencyKey:'p3'} as unknown as ConferenceCommand)).toMatchObject({ok:false})
    const live={...state,sessions:state.sessions.map(s=>s.id===plan.sessionId?{...s,status:'live' as const}:s)}
    expect(conferenceCartridge.validate(live,{type:'SET_SESSION_PLAN',plan,idempotencyKey:'p4'})).toMatchObject({ok:false})
  })
  it('journals valid plan command and replays the exact plan',()=>{
    const state=conferenceCartridge.initialState()
    const plan={...state.plans[0],operator:'AV lead'}
    const command:ConferenceCommand={type:'SET_SESSION_PLAN',plan,idempotencyKey:'planning-001'}
    expect(conferenceCartridge.validate(state,command)).toEqual({ok:true})
    const events=[{...command,seq:1,ts:1000,actorId:'test'}]
    const replay=conferenceCartridge.fold(events)
    expect(replay.plans[0].operator).toBe('AV lead')
    expect(replay).toEqual(conferenceCartridge.fold(events))
    expect(replay.lastSeq).toBe(1)
  })
  it('detects scheduling overlap and unverified required signal',()=>{
    const state=prepared()
    const clash={...state.sessions[0],id:'clash',start:'09:30',end:'10:15'}
    const report=assessReadiness({...state,sessions:[...state.sessions,clash]},'demo-open')
    expect(report.issues.map(x=>x.code)).toContain('ROOM_CONFLICT')
    const fault={...state,signals:state.signals.map(x=>x.signal==='captions'?{...x,status:'fault' as const}:x)}
    expect(assessReadiness(fault,'demo-open').issues.map(x=>x.code)).toContain('SIGNAL_CAPTIONS')
  })
  it('blocks all scenarios before GO if preflight is incomplete',()=>{
    const state=conferenceCartridge.initialState()
    for(const scenario of ['normal','caption-loss','speaker-late'] as const){
      const report=rehearse(state,'demo-open',scenario)
      expect(report.passed).toBe(false)
      expect(report.steps.map(x=>x.phase)).toEqual(['HOLD'])
      expect(report.physicalEffects).toBe(false)
    }
  })
  it('simulates deterministic normal program with no physical effects',()=>{
    const state=prepared()
    expect(assessReadiness(state,'demo-open').verdict).toBe('ready-for-rehearsal')
    const result=rehearse(state,'demo-open','normal')
    expect(result.outcome).toBe('completed')
    expect(result.steps.map(x=>x.phase)).toEqual(['STANDBY','GO','CLEAR'])
    expect(result.physicalEffects).toBe(false)
    expect(rehearse(state,'demo-open','normal')).toEqual(result)
  })
  it('executes additional ordered graphics/media cues in normal rehearsal without touching devices',()=>{
    const state=prepared()
    const plan=state.plans[0]
    const extra={id:'slide-one',label:'Welcome slide',offsetSec:12,action:'TAKE_GRAPHIC' as const}
    const media={id:'clip-one',label:'Opening clip',offsetSec:15,action:'PLAY_MEDIA' as const}
    const next={...plan,cues:[plan.cues[0],plan.cues[1],extra,media,plan.cues[2]]}
    expect(validateProductionPlan(next,state.sessions[0])).toEqual([])
    const preparedState={...state,plans:[next,...state.plans.slice(1)]}
    const report=rehearse(preparedState,'demo-open','normal')
    expect(report.steps.map(s=>s.phase)).toEqual(['STANDBY','GO','CUE','CUE','CLEAR'])
    expect(report.steps[2].reason).toContain('TAKE_GRAPHIC')
    expect(report.steps[3].reason).toContain('PLAY_MEDIA')
    expect(report.physicalEffects).toBe(false)
    const invalid={...next,cues:[...next.cues.slice(0,2),{...extra,id:'duplicate',offsetSec:0},...next.cues.slice(2)]}
    expect(validateProductionPlan(invalid,state.sessions[0]).some(i=>i.code==='CUE_ORDER')).toBe(true)
  })
  it.each(['speaker-late','caption-loss','video-loss','network-loss'] as const)('rehearses %s as HOLD/FALLBACK, never automatic resume',scenario=>{
    const result=rehearse(prepared(),'demo-open',scenario)
    expect(result.passed).toBe(true)
    expect(result.outcome).toBe('safely-held')
    expect(result.steps.map(x=>x.phase).slice(-2)).toEqual(['HOLD','FALLBACK'])
    expect(result.steps.some(x=>x.phase==='CLEAR')).toBe(false)
    if(scenario==='speaker-late')expect(result.postFaultReadiness).toBeUndefined()
    else expect(result.postFaultReadiness?.issues.map(x=>x.code)).toContain(`SIGNAL_${{'caption-loss':'CAPTIONS','video-loss':'VIDEO','network-loss':'NETWORK'}[scenario]}`)
    expect(result.physicalEffects).toBe(false)
  })
})
