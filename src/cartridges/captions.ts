import {foldCartridge, type CartridgeEvent, type EventCartridge} from './types'

export type CaptionCue = {
  seq:number
  ts:number
  speaker:string
  text:string
}

export type CaptionState = {
  slug:string
  revision:number
  lastSeq:number
  status:'live'|'paused'
  language:string
  current:{speaker:string;text:string;final:boolean}|null
  history:CaptionCue[]
}

export type CaptionCommand =
  | {type:'SET_PARTIAL'; speaker?:string; text:string; idempotencyKey:string}
  | {type:'COMMIT'; speaker?:string; text:string; idempotencyKey:string}
  | {type:'CLEAR'; idempotencyKey:string}
  | {type:'SET_STATUS'; status:'live'|'paused'; idempotencyKey:string}
  | {type:'SET_LANGUAGE'; language:string; idempotencyKey:string}
  | {type:'RESET'; idempotencyKey:string}

type CaptionEvent = CartridgeEvent<CaptionCommand>

export function initialCaptionState(slug='main'):CaptionState {
  return {slug,revision:0,lastSeq:0,status:'live',language:'en-US',current:null,history:[]}
}

export function reduceCaptions(state:CaptionState,event:CaptionEvent):CaptionState {
  if(event.type==='RESET') return {...initialCaptionState(state.slug),revision:state.revision+1,lastSeq:event.seq}
  const next={...state,revision:state.revision+1,lastSeq:event.seq}
  switch(event.type){
    case 'SET_PARTIAL': return {...next,current:{speaker:(event.speaker||'').slice(0,80),text:event.text.slice(0,500),final:false}}
    case 'COMMIT': {
      const text=event.text.trim().slice(0,500)
      if(!text) return {...next,current:null}
      const cue:CaptionCue={seq:event.seq,ts:event.ts,speaker:(event.speaker||'').slice(0,80),text}
      return {...next,current:{speaker:cue.speaker,text:cue.text,final:true},history:[...state.history.slice(-99),cue]}
    }
    case 'CLEAR': return {...next,current:null}
    case 'SET_STATUS': return {...next,status:event.status}
    case 'SET_LANGUAGE': return {...next,language:event.language.slice(0,32)||'en-US'}
  }
}

export const captionsCartridge:EventCartridge<CaptionState,CaptionCommand>={
  id:'captions',version:'0.1.0',label:'Live Captions',
  description:'Incremental live captions with partial text, committed cues, speaker labels, language, and transcript history.',
  initialState:initialCaptionState,
  validate(state,command){
    if((command.type==='SET_PARTIAL'||command.type==='COMMIT')&&command.text.length>500) return {ok:false,message:'Caption cue exceeds 500 characters'}
    if(command.type==='COMMIT'&&!command.text.trim()) return {ok:false,message:'Committed caption cannot be empty'}
    if(command.type==='SET_PARTIAL'&&state.status==='paused') return {ok:false,message:'Captions are paused'}
    return {ok:true}
  },
  reduce:reduceCaptions,
  fold(events,slug='main'){return foldCartridge(captionsCartridge,events,slug)},
}
