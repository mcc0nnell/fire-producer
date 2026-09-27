import {foldCartridge, type EventCartridge, type CartridgeEvent} from './types'

export type ForecastPeriod = {label:string; temperature:number; unit:'F'|'C'; condition:string; precipPct?:number}
export type WeatherState = {
  slug:string; revision:number; lastSeq:number
  location:string
  current:{temperature:number; unit:'F'|'C'; condition:string; wind?:string} | null
  forecast:ForecastPeriod[]
  alert:{severity:'info'|'watch'|'warning'|'emergency'; headline:string; detail:string} | null
  caption:string
}

export type WeatherCommand =
  | {type:'SET_LOCATION'; location:string; idempotencyKey:string}
  | {type:'SET_CURRENT'; temperature:number; unit:'F'|'C'; condition:string; wind?:string; idempotencyKey:string}
  | {type:'SET_FORECAST'; periods:ForecastPeriod[]; idempotencyKey:string}
  | {type:'SET_ALERT'; severity:WeatherState['alert'] extends infer A ? A extends {severity:infer S} ? S : never : never; headline:string; detail:string; idempotencyKey:string}
  | {type:'CLEAR_ALERT'; idempotencyKey:string}
  | {type:'CAPTION'; text:string; idempotencyKey:string}
  | {type:'RESET'; idempotencyKey:string}

type WeatherEvent = CartridgeEvent<WeatherCommand>

export function initialWeatherState(slug='weather'): WeatherState {
  return {slug, revision:0, lastSeq:0, location:'', current:null, forecast:[], alert:null, caption:''}
}

export function reduceWeather(state: WeatherState, event: WeatherEvent): WeatherState {
  if (event.type === 'RESET') return {...initialWeatherState(state.slug), revision:state.revision+1, lastSeq:event.seq}
  const next={...state, revision:state.revision+1, lastSeq:event.seq}
  switch(event.type) {
    case 'SET_LOCATION': return {...next, location:event.location.slice(0,120)}
    case 'SET_CURRENT': return {...next, current:{temperature:event.temperature, unit:event.unit, condition:event.condition.slice(0,100), wind:event.wind?.slice(0,80)}}
    case 'SET_FORECAST': return {...next, forecast:event.periods.slice(0,10)}
    case 'SET_ALERT': return {...next, alert:{severity:event.severity, headline:event.headline.slice(0,180), detail:event.detail.slice(0,500)}}
    case 'CLEAR_ALERT': return {...next, alert:null}
    case 'CAPTION': return {...next, caption:event.text.slice(0,240)}
  }
}

export const weatherCartridge: EventCartridge<WeatherState, WeatherCommand> = {
  id:'weather', version:'0.1.0', label:'Weather',
  description:'Conditions, forecast periods, weather alerts, captions, and broadcast graphics state.',
  initialState:initialWeatherState,
  validate(_state, command) {
    if (command.type === 'SET_FORECAST' && command.periods.length > 10) return {ok:false,message:'Forecast accepts at most 10 periods'}
    if (command.type === 'SET_CURRENT' && !Number.isFinite(command.temperature)) return {ok:false,message:'Temperature must be finite'}
    return {ok:true}
  },
  reduce:reduceWeather,
  fold(events, slug='weather') { return foldCartridge(weatherCartridge, events, slug) },
}
