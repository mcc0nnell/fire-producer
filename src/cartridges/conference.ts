import {foldCartridge, type CartridgeEvent, type EventCartridge} from './types'
import {defaultProductionPlan, validateProductionPlan, type SessionProductionPlan} from '../conference/planning'

export type SessionStatus = 'scheduled' | 'ready' | 'live' | 'delayed' | 'ended'
export type SignalStatus = 'unknown' | 'ok' | 'warning' | 'fault'
export type SignalId = 'audio' | 'video' | 'captions' | 'asl' | 'recording' | 'network' | 'tronix'
export type ConferenceRoom = {id:string; name:string}
export type ConferenceSession = {
  id:string; roomId:string; date:string; start:string; end:string
  title:string; speaker:string; status:SessionStatus
}
export type ConferenceSignal = {roomId:string; signal:SignalId; status:SignalStatus; note:string}
export type ConferenceState = {
  slug:string; revision:number; lastSeq:number; eventName:string; timeZone:string
  rooms:ConferenceRoom[]; sessions:ConferenceSession[]; signals:ConferenceSignal[]; plans:SessionProductionPlan[]
  cue:{roomId:string; label:string; seq:number}|null; message:string
}
export type ConferenceCommand =
  | {type:'UPSERT_SESSION'; session:ConferenceSession; idempotencyKey:string}
  | {type:'SET_SESSION_STATUS'; sessionId:string; status:SessionStatus; idempotencyKey:string}
  | {type:'SET_SIGNAL'; roomId:string; signal:SignalId; status:SignalStatus; note:string; idempotencyKey:string}
  | {type:'TAKE_CUE'; roomId:string; label:string; idempotencyKey:string}
  | {type:'SET_MESSAGE'; text:string; idempotencyKey:string}
  | {type:'SET_SESSION_PLAN'; plan:SessionProductionPlan; idempotencyKey:string}

const statuses:SessionStatus[]=['scheduled','ready','live','delayed','ended']
const signals:SignalId[]=['audio','video','captions','asl','recording','network','tronix']
const qualities:SignalStatus[]=['unknown','ok','warning','fault']
const validId=(v:unknown):v is string=>typeof v==='string' && /^[a-zA-Z0-9_-]{1,64}$/.test(v)
const validText=(v:unknown,max:number):v is string=>typeof v==='string' && v.length<=max
const validDate=(v:unknown):v is string=>typeof v==='string' && /^2027-04-(28|29|30)$/.test(v)
const validTime=(v:unknown):v is string=>typeof v==='string' && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(v)
const fail=(message:string)=>({ok:false as const,message})

export function initialConferenceState(slug='dc27'):ConferenceState {
  // All sample sessions are deliberately labeled DEMO, not the DIG program.
  const rooms=[{id:'main',name:'Main Stage'},{id:'room-a',name:'Breakout A'},{id:'room-b',name:'Breakout B'}]
  const sessions:ConferenceSession[]=[
    {id:'demo-open',roomId:'main',date:'2027-04-28',start:'09:00',end:'10:00',title:'DEMO — Opening session',speaker:'Sample rundown',status:'scheduled'},
    {id:'demo-panel',roomId:'main',date:'2027-04-28',start:'10:30',end:'11:30',title:'DEMO — Featured discussion',speaker:'Sample rundown',status:'scheduled'},
    {id:'demo-a',roomId:'room-a',date:'2027-04-28',start:'10:00',end:'11:00',title:'DEMO — Workshop A',speaker:'Sample rundown',status:'scheduled'},
    {id:'demo-b',roomId:'room-b',date:'2027-04-28',start:'10:00',end:'11:00',title:'DEMO — Workshop B',speaker:'Sample rundown',status:'scheduled'},
    {id:'demo-day2',roomId:'main',date:'2027-04-29',start:'09:00',end:'10:00',title:'DEMO — Day two program',speaker:'Sample rundown',status:'scheduled'},
    {id:'demo-day3',roomId:'main',date:'2027-04-30',start:'09:00',end:'10:00',title:'DEMO — Closing day',speaker:'Sample rundown',status:'scheduled'},
  ]
  return {slug,revision:0,lastSeq:0,eventName:'DIG NTC DC27',timeZone:'America/New_York',rooms,sessions,plans:sessions.map(defaultProductionPlan),signals:[],cue:null,message:''}
}

export function reduceConference(state:ConferenceState,event:CartridgeEvent<ConferenceCommand>):ConferenceState {
  const next={...state,revision:state.revision+1,lastSeq:event.seq}
  switch(event.type){
    case 'UPSERT_SESSION':{
      const session={...event.session}
      const existing=state.sessions.some(s=>s.id===session.id)
      return {...next,sessions:existing
        ? state.sessions.map(s=>s.id===session.id?session:s)
        : [...state.sessions,session],
        plans:existing?state.plans:[...state.plans,defaultProductionPlan(session)]}
    }
    case 'SET_SESSION_STATUS':
      return {...next,sessions:state.sessions.map(s=>s.id===event.sessionId?{...s,status:event.status}:s)}
    case 'SET_SIGNAL':{
      const entry={roomId:event.roomId,signal:event.signal,status:event.status,note:event.note}
      return {...next,signals:[...state.signals.filter(s=>!(s.roomId===entry.roomId&&s.signal===entry.signal)),entry]}
    }
    case 'TAKE_CUE':return {...next,cue:{roomId:event.roomId,label:event.label,seq:event.seq}}
    case 'SET_MESSAGE':return {...next,message:event.text}
    case 'SET_SESSION_PLAN':return {...next,plans:state.plans.some(p=>p.sessionId===event.plan.sessionId)
      ? state.plans.map(p=>p.sessionId===event.plan.sessionId?event.plan:p)
      : [...state.plans,event.plan]}
  }
}

export const conferenceCartridge:EventCartridge<ConferenceState,ConferenceCommand>={
  id:'conference',version:'0.1.0',label:'Conference / DC27',
  description:'Three-day session grid, room cues, accessibility readiness and operator-attested signal health.',
  initialState:initialConferenceState,
  validate(state,command){
    if (!command || typeof command!=='object') return fail('Invalid command')
    switch(command.type){
      case 'UPSERT_SESSION':{
        const s=command.session
        if(!s || typeof s!=='object' || !validId(s.id) || !validId(s.roomId) ||
           !validDate(s.date) || !validTime(s.start) || !validTime(s.end) || s.end<=s.start ||
           !validText(s.title,120) || !s.title.trim() || !validText(s.speaker,100) ||
           !statuses.includes(s.status)) return fail('Invalid session')
        if (!state.rooms.some(r=>r.id===s.roomId)) return fail('Unknown room')
        if (state.sessions.length>=150 && !state.sessions.some(x=>x.id===s.id)) return fail('Rundown capacity reached')
        if (s.status==='live' && state.sessions.some(x=>x.id!==s.id && x.roomId===s.roomId && x.status==='live'))
          return fail('Another session is live in that room')
        return {ok:true}
      }
      case 'SET_SESSION_STATUS':{
        if(!validId(command.sessionId) || !statuses.includes(command.status)) return fail('Invalid status change')
        const session=state.sessions.find(s=>s.id===command.sessionId)
        if(!session) return fail('Unknown session')
        if(command.status==='live' && state.sessions.some(s=>s.id!==session.id&&s.roomId===session.roomId&&s.status==='live'))
          return fail('Another session is live in that room')
        return {ok:true}
      }
      case 'SET_SIGNAL':
        return validId(command.roomId) && (command.roomId==='show'||state.rooms.some(r=>r.id===command.roomId))
          && signals.includes(command.signal) && qualities.includes(command.status)
          && validText(command.note,160) ? {ok:true} : fail('Invalid signal report')
      case 'TAKE_CUE':
        return state.rooms.some(r=>r.id===command.roomId) && validText(command.label,80) && !!command.label.trim()
          ? {ok:true} : fail('Invalid cue')
      case 'SET_MESSAGE':
        return validText(command.text,240) ? {ok:true} : fail('Invalid message')
      case 'SET_SESSION_PLAN':{
        const issues=validateProductionPlan(command.plan,state.sessions.find(s=>s.id===command.plan?.sessionId))
        if(issues.length)return fail(issues[0].detail)
        const session=state.sessions.find(s=>s.id===command.plan.sessionId)!
        if(session.status==='live')return fail('Cannot edit a live session plan')
        return {ok:true}
      }
      default:return fail('Unknown conference command')
    }
  },
  reduce:reduceConference,
  fold(events,slug='dc27'){return foldCartridge(conferenceCartridge,events,slug)},
}
