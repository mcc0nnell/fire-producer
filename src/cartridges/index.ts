import {footballCartridge} from './football'
import {newsCartridge} from './news'
import {weatherCartridge} from './weather'
import {captionsCartridge} from './captions'

export const cartridgeCatalog = {
  football: footballCartridge,
  news: newsCartridge,
  weather: weatherCartridge,
  captions: captionsCartridge,
} as const

export type CartridgeId = keyof typeof cartridgeCatalog

export const cartridgeManifests = Object.values(cartridgeCatalog).map(({id,version,label,description}) => ({id,version,label,description}))
