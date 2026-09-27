import {DurableObject} from 'cloudflare:workers'
import {foldEvents, type GameCommand, type GameEvent, type GameState} from '../src/core/game'

type Env = {GAME: DurableObjectNamespace<GameDO>; ASSETS: Fetcher}
type Row = {seq: number; idempotency_key: string; event_json: string}

const json = (value: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(value), {
  ...init, headers: {'content-type': 'application/json; charset=utf-8', ...init.headers},
})

export class GameDO extends DurableObject<Env> {
  private events: GameEvent[] = []
  private state: GameState = foldEvents([])
  private keys = new Map<string, number>()
  private slug = 'demo'

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS game_events (
        seq INTEGER PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        event_json TEXT NOT NULL
      )`)
      const rows = this.ctx.storage.sql.exec<Row>('SELECT seq,idempotency_key,event_json FROM game_events ORDER BY seq').toArray()
      this.events = rows.map((r) => JSON.parse(r.event_json) as GameEvent)
      rows.forEach((r) => this.keys.set(r.idempotency_key, r.seq))
      this.state = foldEvents(this.events, this.slug)
    })
  }

  async fetch(request: Request) {
    const url = new URL(request.url)
    this.slug = url.searchParams.get('slug') || this.slug
    if (url.pathname.endsWith('/state')) return json({state: {...this.state, slug: this.slug}})
    if (url.pathname.endsWith('/events')) return json({events: this.events})
    if (url.pathname.endsWith('/command')) return this.command(request)
    if (url.pathname.endsWith('/ws')) return this.websocket(request)
    return new Response('Not found', {status: 404})
  }

  private async command(request: Request) {
    if (request.method !== 'POST') return new Response('Method not allowed', {status: 405})
    let command: GameCommand
    try { command = (await request.json()) as GameCommand } catch { return json({error: 'invalid json'}, {status: 400}) }
    if (!command?.type || !command?.idempotencyKey) return json({error: 'invalid command'}, {status: 400})
    const existing = this.keys.get(command.idempotencyKey)
    if (existing !== undefined) return json({applied: false, seq: existing, state: this.state})
    const event = {...command, seq: this.state.lastSeq + 1, ts: Date.now(), actorId: request.headers.get('x-fire-producer-actor') || 'operator'} as GameEvent
    this.ctx.storage.sql.exec('INSERT INTO game_events (seq,idempotency_key,event_json) VALUES (?,?,?)', event.seq, event.idempotencyKey, JSON.stringify(event))
    this.events.push(event); this.keys.set(event.idempotencyKey, event.seq); this.state = foldEvents(this.events, this.slug)
    this.broadcast({type: 'EVENT', event, state: this.state})
    return json({applied: true, seq: event.seq, state: this.state})
  }

  private websocket(request: Request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', {status: 426})
    const pair = new WebSocketPair(); const client = pair[0]; const server = pair[1]
    this.ctx.acceptWebSocket(server)
    server.send(JSON.stringify({type: 'SNAPSHOT', state: this.state}))
    return new Response(null, {status: 101, webSocket: client})
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) { if (message === 'ping') socket.send('pong') }
  private broadcast(message: unknown) {
    const wire = JSON.stringify(message)
    for (const socket of this.ctx.getWebSockets()) { try { socket.send(wire) } catch {} }
  }
}
