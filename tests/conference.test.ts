import {describe,expect,it} from 'vitest'
import {conferenceCartridge, initialConferenceState, type ConferenceCommand} from '../src/cartridges/conference'
import type {CartridgeEvent} from '../src/cartridges/types'

const event=(seq:number,command:ConferenceCommand):CartridgeEvent<ConferenceCommand>=>({...command,seq,ts:seq*1000,actorId:'operator'})
const command=<T extends ConferenceCommand['type']>(type:T,fields:Omit<Extract<ConferenceCommand,{type:T}>,'type'|'idempotencyKey'>):ConferenceCommand=>
  ({type,idempotencyKey:`test-${type}`,...fields}) as unknown as ConferenceCommand

describe('DC27 conference authority',()=>{
  it('starts with explicitly demo-labeled content across all three days',()=>{
    const state=initialConferenceState('dc27')
    expect(state.sessions).toHaveLength(6)
    expect(new Set(state.sessions.map(s=>s.date))).toEqual(new Set(['2027-04-28','2027-04-29','2027-04-30']))
    expect(state.sessions.every(s=>s.title.startsWith('DEMO'))).toBe(true)
    expect(state.signals).toHaveLength(0)
  })
  it('replays session state, cues and readiness deterministically',()=>{
    const actions:ConferenceCommand[]=[
      command('SET_SESSION_STATUS',{sessionId:'demo-open',status:'ready'}),
      command('SET_SESSION_STATUS',{sessionId:'demo-open',status:'live'}),
      command('SET_SIGNAL',{roomId:'main',signal:'captions',status:'warning',note:'operator reported'}),
      command('TAKE_CUE',{roomId:'main',label:'GO'}),
    ]
    const events=actions.map((action,i)=>event(i+1,action))
    const state=conferenceCartridge.fold(events)
    expect(state.sessions.find(s=>s.id==='demo-open')?.status).toBe('live')
    expect(state.signals).toEqual([{roomId:'main',signal:'captions',status:'warning',note:'operator reported'}])
    expect(state.cue).toEqual({roomId:'main',label:'GO',seq:4})
    expect(conferenceCartridge.fold(events)).toEqual(state)
    expect(state.lastSeq).toBe(4)
  })
  it('never allows overlapping LIVE sessions in one room',()=>{
    const first=command('SET_SESSION_STATUS',{sessionId:'demo-open',status:'live'})
    let state=conferenceCartridge.initialState()
    expect(conferenceCartridge.validate(state,first)).toEqual({ok:true})
    state=conferenceCartridge.reduce(state,event(1,first))
    expect(conferenceCartridge.validate(state,command('SET_SESSION_STATUS',{sessionId:'demo-panel',status:'live'}))).toMatchObject({ok:false})
    expect(conferenceCartridge.validate(state,command('SET_SESSION_STATUS',{sessionId:'demo-a',status:'live'}))).toEqual({ok:true})
  })
  it('rejects unknown sessions and malformed input before journal insertion',()=>{
    const state=conferenceCartridge.initialState()
    expect(conferenceCartridge.validate(state,command('SET_SESSION_STATUS',{sessionId:'unknown',status:'live'}))).toMatchObject({ok:false})
    expect(conferenceCartridge.validate(state,command('TAKE_CUE',{roomId:'bad',label:'GO'}))).toMatchObject({ok:false})
    expect(conferenceCartridge.validate(state,command('UPSERT_SESSION',{session:{
      id:'invalid',roomId:'main',date:'2027-04-28',start:'12:30',end:'11:00',
      title:'Bad order',speaker:'',status:'scheduled',
    }}))).toMatchObject({ok:false})
    expect(conferenceCartridge.validate(state,{type:'SET_SIGNAL',roomId:'show',signal:'audio',status:'ok',note:12,idempotencyKey:'bad'} as unknown as ConferenceCommand)).toMatchObject({ok:false})
    expect(conferenceCartridge.validate(state,{type:'UPSERT_SESSION',session:null,idempotencyKey:'bad'} as unknown as ConferenceCommand)).toMatchObject({ok:false})
  })
  it('caps rundown and rejects oversized messages',()=>{
    const state=conferenceCartridge.initialState()
    expect(conferenceCartridge.validate(state,command('SET_MESSAGE',{text:'a'.repeat(241)}))).toMatchObject({ok:false})
    expect(conferenceCartridge.validate(state,command('UPSERT_SESSION',{session:{
      id:'added',roomId:'room-b',date:'2027-04-30',start:'15:00',end:'16:00',
      title:'Accessible operations',speaker:'',status:'scheduled',
    }}))).toEqual({ok:true})
  })
})
