import {foldCartridge, type EventCartridge, type CartridgeEvent} from './types'

export type NewsState = {
  slug: string; revision: number; lastSeq: number
  story: {slug: string; headline: string; deck: string} | null
  lowerThird: {name: string; title: string} | null
  breaking: string | null
  ticker: string[]
  caption: string
}

export type NewsCommand =
  | {type:'SET_STORY'; slug:string; headline:string; deck:string; idempotencyKey:string}
  | {type:'SET_LOWER_THIRD'; name:string; title:string; idempotencyKey:string}
  | {type:'CLEAR_LOWER_THIRD'; idempotencyKey:string}
  | {type:'BREAKING'; text:string; idempotencyKey:string}
  | {type:'CLEAR_BREAKING'; idempotencyKey:string}
  | {type:'SET_TICKER'; items:string[]; idempotencyKey:string}
  | {type:'CAPTION'; text:string; idempotencyKey:string}
  | {type:'RESET'; idempotencyKey:string}

type NewsEvent = CartridgeEvent<NewsCommand>

export function initialNewsState(slug='news'): NewsState {
  return {slug, revision:0, lastSeq:0, story:null, lowerThird:null, breaking:null, ticker:[], caption:''}
}

export function reduceNews(state: NewsState, event: NewsEvent): NewsState {
  if (event.type === 'RESET') return {...initialNewsState(state.slug), revision:state.revision+1, lastSeq:event.seq}
  const next = {...state, revision:state.revision+1, lastSeq:event.seq}
  switch (event.type) {
    case 'SET_STORY': return {...next, story:{slug:event.slug, headline:event.headline.slice(0,160), deck:event.deck.slice(0,280)}}
    case 'SET_LOWER_THIRD': return {...next, lowerThird:{name:event.name.slice(0,80), title:event.title.slice(0,120)}}
    case 'CLEAR_LOWER_THIRD': return {...next, lowerThird:null}
    case 'BREAKING': return {...next, breaking:event.text.slice(0,180)}
    case 'CLEAR_BREAKING': return {...next, breaking:null}
    case 'SET_TICKER': return {...next, ticker:event.items.slice(0,20).map((x)=>x.slice(0,180))}
    case 'CAPTION': return {...next, caption:event.text.slice(0,240)}
  }
}

export const newsCartridge: EventCartridge<NewsState, NewsCommand> = {
  id:'news', version:'0.1.0', label:'News',
  description:'Stories, breaking straps, lower thirds, ticker, captions, and rundown-oriented live production.',
  initialState:initialNewsState,
  validate(_state, command) {
    if (command.type === 'SET_STORY' && !command.headline.trim()) return {ok:false,message:'Headline is required'}
    if (command.type === 'SET_TICKER' && command.items.length > 20) return {ok:false,message:'Ticker accepts at most 20 items'}
    return {ok:true}
  },
  reduce:reduceNews,
  fold(events, slug='news') { return foldCartridge(newsCartridge, events, slug) },
}
