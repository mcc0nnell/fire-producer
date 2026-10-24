// SPDX-License-Identifier: Apache-2.0
// Pure, deterministic SF26-inspired production planning. No hardware side effects.
import type {ConferenceSession,ConferenceState,SignalId} from '../cartridges/conference'

export type RouteKey='audio'|'video'|'captions'|'asl'|'recording'
export const ROUTES:RouteKey[]=['audio','video','captions','asl','recording']
export const REQUIRED_SIGNALS:SignalId[]=['audio','video','captions','asl','recording','network']
export type PlannedCue={id:string;label:string;offsetSec:number;action:'STANDBY'|'GO_LIVE'|'TAKE_GRAPHIC'|'PLAY_MEDIA'|'CLEAR'}
export type SessionProductionPlan={sessionId:string;operator:string;fallbackMessage:string;routes:Record<RouteKey,string>;cues:PlannedCue[]}
export type PlanIssue={code:string;detail:string}
export type ReadinessReport={sessionId:string;verdict:'ready-for-rehearsal'|'blocked';issues:PlanIssue[];evidence:{signal:SignalId;status:string;note:string}[]}
export type RehearsalScenario='normal'|'speaker-late'|'caption-loss'|'video-loss'|'network-loss'
export const SCENARIOS:RehearsalScenario[]=['normal','speaker-late','caption-loss','video-loss','network-loss']
export type RehearsalStep={seconds:number;phase:'STANDBY'|'GO'|'CUE'|'HOLD'|'FALLBACK'|'CLEAR';reason:string}
export type RehearsalReport={sessionId:string;scenario:RehearsalScenario;sourceRevision:number;passed:boolean;outcome:'completed'|'blocked-before-air'|'safely-held';readiness:ReadinessReport;postFaultReadiness?:ReadinessReport;steps:RehearsalStep[];physicalEffects:false}
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length<=max
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(v)
export function defaultProductionPlan(session:ConferenceSession):SessionProductionPlan{
  const duration=(Number(session.end.slice(0,2))*60+Number(session.end.slice(3,5))-Number(session.start.slice(0,2))*60-Number(session.start.slice(3,5)))*60
  return {sessionId:session.id,operator:'',fallbackMessage:'Stand by. This session will resume shortly.',
    routes:{audio:'',video:'',captions:'',asl:'',recording:''},
    cues:[{id:'standby',label:'Standby slate',offsetSec:-300,action:'STANDBY'},
      {id:'go',label:'Open program',offsetSec:0,action:'GO_LIVE'},
      {id:'clear',label:'Clear stage',offsetSec:duration,action:'CLEAR'}]}
}
export function validateProductionPlan(value:unknown,session:ConferenceSession|undefined):PlanIssue[]{
  const issues:PlanIssue[]=[]
  if(!session)return [{code:'UNKNOWN_SESSION',detail:'Session does not exist'}]
  if(!value||typeof value!=='object'||Array.isArray(value))return [{code:'BAD_PLAN',detail:'Plan must be an object'}]
  const p=value as Record<string,unknown>
  if(p.sessionId!==session.id)issues.push({code:'SESSION_MISMATCH',detail:'Plan session ID mismatch'})
  if(!text(p.operator,100)||!text(p.fallbackMessage,240))issues.push({code:'BAD_FIELDS',detail:'Operator/fallback text too long or missing type'})
  if(!p.routes||typeof p.routes!=='object'||Array.isArray(p.routes))issues.push({code:'BAD_ROUTES',detail:'Routes must be an object'})
  else for(const key of ROUTES)if(!text((p.routes as Record<string,unknown>)[key],120))issues.push({code:'BAD_ROUTE',detail:`Invalid ${key} route`})
  if(!Array.isArray(p.cues)||p.cues.length<3||p.cues.length>30){
    issues.push({code:'BAD_CUES',detail:'Plan must contain 3–30 ordered cues'});return issues
  }
  const duration=(Number(session.end.slice(0,2))*60+Number(session.end.slice(3,5))-Number(session.start.slice(0,2))*60-Number(session.start.slice(3,5)))*60
  const seen=new Set<string>()
  let last=-601
  const actions:string[]=[]
  for(const raw of p.cues){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)){issues.push({code:'BAD_CUE',detail:'Cue is not an object'});continue}
    const c=raw as Record<string,unknown>
    if(!id(c.id)||seen.has(c.id))issues.push({code:'CUE_ID',detail:'Cue IDs must be unique'})
    if(typeof c.id==='string')seen.add(c.id)
    if(!text(c.label,80)||!c.label.trim())issues.push({code:'CUE_LABEL',detail:'Cue label required'})
    if(!Number.isInteger(c.offsetSec)||Number(c.offsetSec)<-600||Number(c.offsetSec)>duration||Number(c.offsetSec)<=last)issues.push({code:'CUE_ORDER',detail:'Offsets must be monotonic inside the session'})
    if(typeof c.offsetSec==='number')last=c.offsetSec
    if(!['STANDBY','GO_LIVE','TAKE_GRAPHIC','PLAY_MEDIA','CLEAR'].includes(String(c.action)))issues.push({code:'CUE_ACTION',detail:'Unsupported action'})
    actions.push(String(c.action))
  }
  if(actions.filter(x=>x==='STANDBY').length!==1||actions.filter(x=>x==='GO_LIVE').length!==1||
     actions.filter(x=>x==='CLEAR').length!==1||
     !(actions.indexOf('STANDBY')<actions.indexOf('GO_LIVE')&&actions.indexOf('GO_LIVE')<actions.indexOf('CLEAR')))
    issues.push({code:'CUE_LIFECYCLE',detail:'Exactly one STANDBY, GO_LIVE, then CLEAR is required'})
  const standby=(p.cues as PlannedCue[]).find(c=>c?.action==='STANDBY')
  const go=(p.cues as PlannedCue[]).find(c=>c?.action==='GO_LIVE')
  const clear=(p.cues as PlannedCue[]).find(c=>c?.action==='CLEAR')
  if(standby&&go&&clear&&!(standby.offsetSec<go.offsetSec&&go.offsetSec<clear.offsetSec))
    issues.push({code:'CUE_TIMING',detail:'STANDBY, GO_LIVE and CLEAR must occur at strictly increasing times'})
  return issues
}
export function assessReadiness(state:ConferenceState,sessionId:string):ReadinessReport{
  const session=state.sessions.find(s=>s.id===sessionId)
  const plan=state.plans?.find(p=>p.sessionId===sessionId)
  const issues:PlanIssue[]=[]
  if(!session)issues.push({code:'UNKNOWN_SESSION',detail:'Session not found'})
  else if(!plan)issues.push({code:'NO_PLAN',detail:'No production plan'})
  if(session&&plan){
    issues.push(...validateProductionPlan(plan,session))
    if(!plan.operator.trim())issues.push({code:'NO_OPERATOR',detail:'No operator assigned'})
    if(!plan.fallbackMessage.trim())issues.push({code:'NO_FALLBACK',detail:'No fallback message'})
    for(const key of ROUTES)if(!plan.routes[key].trim())issues.push({code:`NO_ROUTE_${key.toUpperCase()}`,detail:`${key} signal path unassigned`})
    for(const other of state.sessions)if(other.id!==sessionId&&other.roomId===session.roomId&&other.date===session.date&&other.start<session.end&&session.start<other.end)
      issues.push({code:'ROOM_CONFLICT',detail:`Overlaps session ${other.id}`})
  }
  const evidence=REQUIRED_SIGNALS.map(signal=>{
    const entry=state.signals.find(s=>s.roomId===session?.roomId&&s.signal===signal)
    const status=entry?.status||'unknown'
    if(status!=='ok')issues.push({code:`SIGNAL_${signal.toUpperCase()}`,detail:`${signal} is ${status} (manually reported)`})
    return {signal,status,note:entry?.note||''}
  })
  return {sessionId,verdict:issues.length?'blocked':'ready-for-rehearsal',issues,evidence}
}
export function rehearse(state:ConferenceState,sessionId:string,scenario:RehearsalScenario):RehearsalReport{
  if(!SCENARIOS.includes(scenario))throw Error('Unknown scenario')
  const readiness=assessReadiness(state,sessionId)
  const steps:RehearsalStep[]=[]
  if(readiness.verdict==='blocked'){
    steps.push({seconds:-300,phase:'HOLD',reason:'Preflight blocked; human show director required'})
    return {sessionId,scenario,sourceRevision:state.revision,passed:false,outcome:'blocked-before-air',readiness,steps,physicalEffects:false}
  }
  const plan=state.plans.find(p=>p.sessionId===sessionId)!
  const go=plan.cues.find(x=>x.action==='GO_LIVE')!
  const cueStep=(cue:PlannedCue):RehearsalStep=>({
    seconds:cue.offsetSec,
    phase:cue.action==='GO_LIVE'?'GO':cue.action==='STANDBY'?'STANDBY':cue.action==='CLEAR'?'CLEAR':'CUE',
    reason:`SIMULATION ONLY: ${cue.action} — ${cue.label}`
  })
  for(const cue of plan.cues.filter(c=>c.offsetSec<go.offsetSec))steps.push(cueStep(cue))
  if(scenario==='speaker-late'){
    steps.push({seconds:go.offsetSec,phase:'HOLD',reason:'Presenter absent: GO inhibited'})
    steps.push({seconds:go.offsetSec+30,phase:'FALLBACK',reason:plan.fallbackMessage})
    return {sessionId,scenario,sourceRevision:state.revision,passed:true,outcome:'safely-held',readiness,steps,physicalEffects:false}
  }
  steps.push(cueStep(go))
  if(scenario!=='normal'){
    const faultSignal={'caption-loss':'captions','video-loss':'video','network-loss':'network'}[scenario]
    const session=state.sessions.find(s=>s.id===sessionId)!
    const simulated={...state,signals:state.signals.map(s=>
      s.roomId===session.roomId&&s.signal===faultSignal
        ? {...s,status:'fault' as const,note:'INJECTED ONLY FOR REHEARSAL'}:s)}
    const postFaultReadiness=assessReadiness(simulated,sessionId)
    const detected=postFaultReadiness.issues.some(x=>x.code===`SIGNAL_${faultSignal.toUpperCase()}`)
    if(!detected)throw Error('Fault injection was not detected')
    steps.push({seconds:go.offsetSec+30,phase:'HOLD',reason:`${faultSignal} fault detected; halt cue advance and notify operator`})
    steps.push({seconds:go.offsetSec+31,phase:'FALLBACK',reason:plan.fallbackMessage})
    return {sessionId,scenario,sourceRevision:state.revision,passed:true,outcome:'safely-held',readiness,postFaultReadiness,steps,physicalEffects:false}
  }
  for(const cue of plan.cues.filter(c=>c.offsetSec>go.offsetSec))steps.push(cueStep(cue))
  return {sessionId,scenario,sourceRevision:state.revision,passed:true,outcome:'completed',readiness,steps,physicalEffects:false}
}
