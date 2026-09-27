import './style.css'
import {visibleClock, type GameCommand, type GameState} from './core/game'

const root = document.querySelector<HTMLDivElement>('#app')!
const params = new URLSearchParams(location.search)
const mode = params.get('mode') === 'operator' ? 'operator' : 'viewer'
const slug = params.get('game') || 'demo'
let state: GameState | null = null

const id = () => crypto.randomUUID()
const api = (action: string) => `/api/games/${encodeURIComponent(slug)}/${action}`

async function send(command: object) {
  await fetch(api('command'), {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({...command, idempotencyKey: id()})})
}

function fmt(ms: number) {
  const total = Math.ceil(ms / 1000); const m = Math.floor(total / 60); const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function render() {
  if (!state) { root.innerHTML = '<main class="loading">Connecting to game…</main>'; return }
  const s = state
  root.innerHTML = `
    <main class="shell ${mode}">
      <header><div><span class="live">LIVE</span><strong>FIRE PRODUCER</strong></div><nav><a href="?mode=viewer&game=${slug}">Viewer</a><a href="?mode=operator&game=${slug}">Operator</a></nav></header>
      <section class="stage">
        <div class="video"><div class="field"><span>LIVE PROGRAM FEED</span><small>HLS / encoder input lands here</small></div></div>
        <div class="scorebug">
          <div><b>${s.away.short}</b><strong>${s.away.score}</strong></div>
          <div><b>${s.home.short}</b><strong>${s.home.score}</strong></div>
          <div class="meta"><span>Q${s.quarter}</span><span data-clock>${fmt(visibleClock(s))}</span><span>${s.down}&amp;${s.distance}</span><span>${s.possession === 'home' ? s.home.short : s.away.short} · ${s.ballOn}</span></div>
        </div>
        <div class="caption" aria-live="polite">${s.caption || '&nbsp;'}</div>
      </section>
      ${mode === 'operator' ? operator(s) : viewer(s)}
    </main>`
  bind()
}

function operator(s: GameState) { return `
  <section class="panel controls">
    <h2>Game control</h2>
    <div class="control-grid">
      <button data-cmd="away7">${s.away.short} +7</button><button data-cmd="home7">${s.home.short} +7</button>
      <button data-cmd="down">Next down</button><button data-cmd="possession">Flip possession</button>
      <button data-cmd="clock">${s.clock.running ? 'Stop' : 'Start'} clock</button><button data-cmd="quarter">Next quarter</button>
    </div>
    <label>Caption / lower-third text<input id="caption" value="${s.caption.replaceAll('"','&quot;')}" maxlength="240"><button data-cmd="caption">TAKE TEXT</button></label>
  </section>` }

function viewer(s: GameState) { return `
  <section class="panel"><h2>Current drive</h2><div class="drive">${s.drive.length ? s.drive.slice().reverse().map(x => `<div><span>#${x.seq}</span>${x.text}</div>`).join('') : '<p>No drive events yet.</p>'}</div></section>` }

function bind() {
  document.querySelectorAll<HTMLButtonElement>('[data-cmd]').forEach((button) => button.onclick = async () => {
    if (!state) return
    switch (button.dataset.cmd) {
      case 'away7': await send({type:'SCORE', team:'away', points:7}); break
      case 'home7': await send({type:'SCORE', team:'home', points:7}); break
      case 'down': await send({type:'SET_DOWN', down: state.down === 4 ? 1 : state.down + 1}); break
      case 'possession': await send({type:'SET_POSSESSION', team: state.possession === 'home' ? 'away' : 'home'}); break
      case 'clock': await send({type: state.clock.running ? 'STOP_CLOCK' : 'START_CLOCK'}); break
      case 'quarter': await send({type:'SET_QUARTER', quarter: state.quarter + 1}); break
      case 'caption': await send({type:'CAPTION', text:(document.querySelector<HTMLInputElement>('#caption')?.value || '')}); break
    }
  })
}

async function connect() {
  try { const r = await fetch(api('state')); const data = await r.json() as {state:GameState}; state = data.state; render() } catch { render() }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(`${proto}//${location.host}${api('ws')}`)
  ws.onmessage = (event) => { try { const m = JSON.parse(event.data); if (m.state) { state = m.state; render() } } catch {} }
  ws.onclose = () => setTimeout(connect, 1000)
}
connect()
setInterval(() => { const el = document.querySelector<HTMLElement>('[data-clock]'); if (el && state) el.textContent = fmt(visibleClock(state)) }, 250)
