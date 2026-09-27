import {GameDO} from './game-do'
import {EventDO} from './event-do'
import {cartridgeManifests, type CartridgeId} from '../src/cartridges'
export {GameDO, EventDO}

type Env = {
  GAME: DurableObjectNamespace<GameDO>
  EVENT: DurableObjectNamespace<EventDO>
  ASSETS: Fetcher
}

type EventRoute = {cartridge:CartridgeId; slug:string; action:'manifest'|'state'|'events'|'command'|'ws'}

function eventRoute(pathname:string): EventRoute | null {
  const generic=pathname.match(/^\/api\/events\/([^/]+)\/([^/]+)\/(manifest|state|events|command|ws)$/)
  if (generic) return {cartridge:decodeURIComponent(generic[1]) as CartridgeId,slug:decodeURIComponent(generic[2]),action:generic[3] as EventRoute['action']}
  const legacy=pathname.match(/^\/api\/games\/([^/]+)\/(state|events|command|ws)$/)
  if (legacy) return {cartridge:'football',slug:decodeURIComponent(legacy[1]),action:legacy[2] as EventRoute['action']}
  return null
}

export default {
  async fetch(request:Request, env:Env) {
    const url=new URL(request.url)
    if (url.pathname === '/api/cartridges') return Response.json({cartridges:cartridgeManifests})

    const route=eventRoute(url.pathname)
    if (route) {
      const authorityKey=`${route.cartridge}:${route.slug}`
      const id=env.EVENT.idFromName(authorityKey)
      const stub=env.EVENT.get(id)
      const target=new URL(request.url)
      target.pathname=`/${route.action}`
      target.searchParams.set('cartridge',route.cartridge)
      target.searchParams.set('slug',route.slug)
      return stub.fetch(new Request(target,request))
    }
    return env.ASSETS.fetch(request)
  },
}
