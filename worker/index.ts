import {GameDO} from './game-do'
export {GameDO}

type Env = {GAME: DurableObjectNamespace<GameDO>; ASSETS: Fetcher}

function gameRoute(pathname: string) {
  const match = pathname.match(/^\/api\/games\/([^/]+)\/(state|events|command|ws)$/)
  return match ? {slug: decodeURIComponent(match[1]), action: match[2]} : null
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)
    const route = gameRoute(url.pathname)
    if (route) {
      const id = env.GAME.idFromName(route.slug)
      const stub = env.GAME.get(id)
      const target = new URL(request.url)
      target.pathname = `/${route.action}`
      target.searchParams.set('slug', route.slug)
      return stub.fetch(new Request(target, request))
    }
    return env.ASSETS.fetch(request)
  },
}
