import {describe, expect, it} from 'vitest'
import {newsCartridge, initialNewsState, type NewsCommand} from '../src/cartridges/news'
import {weatherCartridge, initialWeatherState, type WeatherCommand} from '../src/cartridges/weather'
import type {CartridgeEvent} from '../src/cartridges/types'

const ev = <C extends {type:string; idempotencyKey:string}>(seq:number, command:C): CartridgeEvent<C> => ({...command,seq,ts:seq*1000,actorId:'test'})

describe('event cartridges', () => {
  it('folds a news rundown projection', () => {
    const events = [
      ev<NewsCommand>(1,{type:'SET_STORY',slug:'city-hall',headline:'Council approves late budget','deck':'Live coverage',idempotencyKey:'n1'}),
      ev<NewsCommand>(2,{type:'SET_LOWER_THIRD',name:'Ada Bay',title:'Reporter',idempotencyKey:'n2'}),
      ev<NewsCommand>(3,{type:'BREAKING',text:'Breaking news',idempotencyKey:'n3'}),
    ]
    const state = newsCartridge.fold(events)
    expect(state.story?.slug).toBe('city-hall')
    expect(state.lowerThird?.name).toBe('Ada Bay')
    expect(state.breaking).toBe('Breaking news')
  })

  it('folds weather conditions and an alert', () => {
    const events = [
      ev<WeatherCommand>(1,{type:'SET_LOCATION',location:'Baltimore, MD',idempotencyKey:'w1'}),
      ev<WeatherCommand>(2,{type:'SET_CURRENT',temperature:72,unit:'F',condition:'Clear',idempotencyKey:'w2'}),
      ev<WeatherCommand>(3,{type:'SET_ALERT',severity:'warning',headline:'Severe thunderstorm warning',detail:'Move indoors.',idempotencyKey:'w3'}),
    ]
    const state = weatherCartridge.fold(events)
    expect(state.location).toBe('Baltimore, MD')
    expect(state.current?.temperature).toBe(72)
    expect(state.alert?.severity).toBe('warning')
  })

  it('starts cartridges from deterministic empty state', () => {
    expect(initialNewsState()).toEqual(newsCartridge.initialState())
    expect(initialWeatherState()).toEqual(weatherCartridge.initialState())
  })
})
