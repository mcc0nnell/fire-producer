import {DurableObject} from 'cloudflare:workers'
import {cartridgeCatalog, type CartridgeId} from '../src/cartridges'

type BaseState = {slug: string; revision: number; lastSeq: number}
type AnyCommand = {type: string; idempotencyKey: string; [key: string]: unknown}
type AnyEvent = AnyCommand & {seq: number; ts: number; actorId: string}
type RuntimeCartridge = {
  id: string
  version: string
  label: string
  description: string
  initialState(slug?: string): BaseState
  validate(state: BaseState, command: AnyCommand): {ok:true}|{ok:false;message:string}
  reduce(state: BaseState, event: AnyEvent): BaseState
  fold(events: AnyEvent[], slug?: string): BaseState
}

type Env = {EVENT: DurableObjectNamespace<EventDO>; ASSETS: Fetcher}
type Row = {seq:number; idempotency_key:string; event_json:string}
type MetaRow = {cartridge_id:string; slug:string}

const runtimes = cartridgeCatalog as unknown as Record<CartridgeId, RuntimeCartridge>
const json = (value:unknown, init:ResponseInit={}) => new Response(JSON.stringify(value), {
  ...init,
  headers:{'content-type':'application/json; charset=utf-8', ...init.headers},
})

export class EventDO extends DurableObject<Env> {
  private events: AnyEvent[] = []
  private keys = new Map<string, number>()
  private cartridgeId: CartridgeId | null = null
  private slug = 'default'
  private state: BaseState | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS event_meta (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        cartridge_id TEXT NOT NULL,
        slug TEXT NOT NULL
      )`)
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS event_log (
        seq INTEGER PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        event_json TEXT NOT NULL
      )`)
      const meta = this.ctx.storage.sql.exec<MetaRow>('SELECT cartridge_id,slug FROM event_meta WHERE singleton=1').toArray()[0]
      const rows = this.ctx.storage.sql.exec<Row>('SELECT seq,idempotency_key,event_json FROM event_log ORDER BY seq').toArray()
      this.events = rows.map((row) => JSON.parse(row.event_json) as AnyEvent)
      rows.forEach((row) => this.keys.set(row.idempotency_key, row.seq))
      if (meta && meta.cartridge_id in runtimes) {
        this.cartridgeId = meta.cartridge_id as CartridgeId
        this.slug = meta.slug
        this.state = this.runtime().fold(this.events, this.slug)
      }
    })
  }

  async fetch(request: Request) {
    const url = new URL(request.url)
    const cartridge = url.searchParams.get('cartridge') as CartridgeId | null
    const slug = url.searchParams.get('slug') || 'default'
    const identity = this.adoptIdentity(cartridge, slug)
    if (identity) return identity

    if (url.pathname.endsWith('/manifest')) return json({cartridge:this.manifest(), slug:this.slug})
    if (url.pathname.endsWith('/state')) return json({cartridge:this.manifest(), state:this.state})
    if (url.pathname.endsWith('/events')) return json({cartridge:this.manifest(), events:this.events})
    if (url.pathname.endsWith('/command')) return this.command(request)
    if (url.pathname.endsWith('/ws')) return this.websocket(request)
    return new Response('Not found', {status:404})
  }

  private adoptIdentity(cartridge: CartridgeId | null, slug: string): Response | null {
    if (!cartridge || !(cartridge in runtimes)) return json({error:'unknown cartridge'}, {status:404})
    if (this.cartridgeId && (this.cartridgeId !== cartridge || this.slug !== slug)) {
      return json({error:'event authority identity mismatch', expected:{cartridge:this.cartridgeId,slug:this.slug}}, {status:409})
    }
    if (!this.cartridgeId) {
      this.cartridgeId = cartridge
      this.slug = slug
      this.state = this.runtime().fold(this.events, slug)
      this.ctx.storage.sql.exec(
        'INSERT OR REPLACE INTO event_meta (singleton,cartridge_id,slug) VALUES (1,?,?)',
        cartridge,
        slug,
      )
    }
    return null
  }

  private runtime() { return runtimes[this.cartridgeId!] }
  private manifest() {
    const {id,version,label,description}=this.runtime()
    return {id,version,label,description}
  }

  private async command(request: Request) {
    if (request.method !== 'POST') return new Response('Method not allowed', {status:405})
    let command: AnyCommand
    try { command=(await request.json()) as AnyCommand } catch { return json({error:'invalid json'}, {status:400}) }
    if (!command?.type || !command?.idempotencyKey) return json({error:'invalid command'}, {status:400})

    const existing=this.keys.get(command.idempotencyKey)
    if (existing !== undefined) return json({applied:false,seq:existing,state:this.state})
    const validation=this.runtime().validate(this.state!,command)
    if (!validation.ok) return json({error:validation.message,code:'REJECTED'}, {status:409})

    const event={
      ...command,
      seq:this.state!.lastSeq+1,
      ts:Date.now(),
      actorId:request.headers.get('x-fire-producer-actor') || 'operator',
    } as AnyEvent
    this.ctx.storage.sql.exec(
      'INSERT INTO event_log (seq,idempotency_key,event_json) VALUES (?,?,?)',
      event.seq,event.idempotencyKey,JSON.stringify(event),
    )
    this.events.push(event)
    this.keys.set(event.idempotencyKey,event.seq)
    this.state=this.runtime().reduce(this.state!,event)
    this.broadcast({type:'EVENT',cartridge:this.manifest(),event,state:this.state})
    return json({applied:true,seq:event.seq,cartridge:this.manifest(),state:this.state})
  }

  private websocket(request: Request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', {status:426})
    const pair=new WebSocketPair(); const client=pair[0]; const server=pair[1]
    this.ctx.acceptWebSocket(server)
    server.send(JSON.stringify({type:'SNAPSHOT',cartridge:this.manifest(),state:this.state}))
    return new Response(null,{status:101,webSocket:client})
  }

  webSocketMessage(socket:WebSocket,message:string|ArrayBuffer) { if (message === 'ping') socket.send('pong') }
  private broadcast(message:unknown) {
    const wire=JSON.stringify(message)
    for (const socket of this.ctx.getWebSockets()) { try { socket.send(wire) } catch {} }
  }
}
