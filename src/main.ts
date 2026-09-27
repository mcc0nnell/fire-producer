import './style.css'
import {visibleClock, type GameState} from './core/game'
import {announceStatus} from './a11y'

const root = document.querySelector<HTMLDivElement>('#app')!
const params = new URLSearchParams(location.search)
const mode = params.get('mode') === 'operator' ? 'operator' : 'viewer'
const slug = params.get('game') || 'demo'
const cartridgeId = params.get('cartridge') || 'football'
const productionSlug = params.get('event') || slug
const streamUrl = params.get('stream')
const composite = params.get('composite')

let state: GameState | null = null
let drawerOpen = false
let connected = false
let stingTimer: number | undefined
let gameCenterModule: typeof import('./game-center') | null = null

const id = () => crypto.randomUUID()
const api = (action: string) => `/api/games/${encodeURIComponent(slug)}/${action}`
const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))

async function send(command: object) {
  const response = await fetch(api('command'), {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({...command, idempotencyKey: id()}),
  })
  if (!response.ok) throw new Error(`command failed: ${response.status}`)
}

function fmt(ms: number) {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function buildShell(s: GameState) {
  root.innerHTML = `
    <main id="main-content" tabindex="-1" class="shell ${mode}">
      <header class="topbar">
        <div class="brand-lockup">
          <span class="fire-mark"><i></i><i></i><i></i></span>
          <div><strong>FIRE PRODUCER</strong><small>LIVE EVENT CONTROL</small></div>
        </div>
        <div class="topbar-right">
          <span class="connection" data-connection><i></i><span>CONNECTING</span></span>
          <nav>
            <a class="${mode === 'viewer' ? 'active' : ''}" href="?mode=viewer&game=${encodeURIComponent(slug)}${streamUrl ? `&stream=${encodeURIComponent(streamUrl)}` : ''}">Viewer</a>
            <a class="${mode === 'operator' ? 'active' : ''}" href="?mode=operator&game=${encodeURIComponent(slug)}${streamUrl ? `&stream=${encodeURIComponent(streamUrl)}` : ''}">Producer</a>
          </nav>
        </div>
      </header>

      <section class="stage" aria-label="Live program output">
        <div class="program-feed">
          ${streamUrl ? '<video id="program-video" autoplay muted playsinline controls aria-label="Live program video"></video>' : syntheticField()}
          <div class="broadcast-shade"></div>
          <div class="program-id"><span class="live-dot"></span> LIVE <b>CAM 1</b></div>
          <div class="network-bug">1080p <span>•</span> PROGRAM</div>
        </div>

        <div class="scorebug" aria-label="Game score">
          <div class="teams">
            <div class="team away" data-away-possession><span class="possession-arrow">▶</span><b data-away-short></b><strong data-away-score></strong></div>
            <div class="team home" data-home-possession><span class="possession-arrow">▶</span><b data-home-short></b><strong data-home-score></strong></div>
          </div>
          <div class="game-strip">
            <span class="quarter" data-quarter></span>
            <strong class="clock" data-clock></strong>
            <span class="down" data-down></span>
            <span class="spot" data-spot></span>
          </div>
        </div>

        <div class="caption-wrap"><div class="caption" data-caption aria-live="polite"></div></div>
        <button class="viewer-peek" data-action="drawer" aria-expanded="false">▲ GAME CENTER</button>
        <div class="sting" data-sting aria-hidden="true"><span data-sting-kicker></span><strong data-sting-title></strong><small data-sting-sub></small></div>
      </section>

      ${mode === 'operator' ? operatorPanel(s) : viewerPanel()}
    </main>`

  bind()
  setupVideo()
  update(s)
}

function syntheticField() {
  return `<div class="synthetic-field" aria-label="Synthetic football program feed">
    <div class="stadium-glow"></div>
    <div class="field-plane">
      ${[10,20,30,40,50,40,30,20,10].map((yard, i) => `<span class="yard" style="--i:${i}"><b>${yard}</b></span>`).join('')}
      <div class="mid-logo"><span>FIRE</span><b>PRODUCER</b></div>
    </div>
    <div class="camera-label"><b>PROGRAM FEED</b><span>Add <code>?stream=https://…m3u8</code> for HLS</span></div>
  </div>`
}

function operatorPanel(s: GameState) {
  return `<section class="producer-console">
    <div class="console-head">
      <div><small>PRODUCTION CONTROL</small><h1>Game ${esc(slug.toUpperCase())}</h1></div>
      <div class="tally"><span></span>PROGRAM LIVE</div>
    </div>
    <div class="console-grid">
      <section class="control-bank score-bank">
        <h2>Score</h2>
        <div class="team-takes"><button class="take away-take" data-cmd="away7"><small data-away-short></small><b>TOUCHDOWN</b><span>+7</span></button><button class="take home-take" data-cmd="home7"><small data-home-short></small><b>TOUCHDOWN</b><span>+7</span></button></div>
        <div class="micro-row"><button data-cmd="away3"><span data-away-short></span> +3</button><button data-cmd="home3"><span data-home-short></span> +3</button></div>
      </section>
      <section class="control-bank situation-bank">
        <h2>Situation</h2>
        <div class="situation-readout"><div><small>DOWN</small><b data-op-down>${s.down}</b></div><div><small>TO GO</small><b data-op-distance>${s.distance}</b></div><div><small>BALL</small><b data-op-ball>${s.ballOn}</b></div></div>
        <div class="button-grid"><button data-cmd="down">NEXT DOWN</button><button data-cmd="distance-minus">TO GO −1</button><button data-cmd="distance-plus">TO GO +1</button><button data-cmd="ball-minus">BALL −5</button><button data-cmd="ball-plus">BALL +5</button><button data-cmd="possession">FLIP POSSESSION</button></div>
      </section>
      <section class="control-bank clock-bank">
        <h2>Clock</h2>
        <div class="big-clock" data-op-clock>${fmt(visibleClock(s))}</div>
        <div class="button-grid two"><button class="primary" data-cmd="clock" data-clock-button>START</button><button data-cmd="quarter">NEXT QUARTER</button></div>
      </section>
      <section class="control-bank text-bank">
        <h2>Caption / lower third</h2>
        <label class="visually-hidden" for="caption-input">Caption or lower-third text</label>
        <textarea id="caption-input" maxlength="240" rows="3">${esc(s.caption)}</textarea>
        <button class="primary take-text" data-cmd="caption">TAKE TEXT TO PROGRAM</button>
      </section>
    </div>
  </section>`
}

function viewerPanel() {
  return `<aside class="game-center" data-drawer aria-hidden="true">
    <div class="drawer-head"><div><small>FIRE PRODUCER</small><h2>Game Center</h2></div><button data-action="drawer" aria-label="Close game center">×</button></div>
    <div class="viewer-facts"><div><small>QUARTER</small><b data-drawer-quarter></b></div><div><small>DOWN</small><b data-drawer-down></b></div><div><small>BALL ON</small><b data-drawer-ball></b></div></div>
    <section class="analytics-card field-card"><div class="analytics-head"><div><small>LIVE POSITION</small><h3>Drive map</h3></div><span>ECHARTS</span></div><div class="field-chart" data-field-chart role="img" aria-label="Current drive field position"></div><p class="chart-summary" data-field-summary></p></section>
    <section class="analytics-card score-card"><div class="analytics-head"><div><small>GAME FLOW</small><h3>Scoring timeline</h3></div><span>LIVE</span></div><div class="score-chart" data-score-chart role="img" aria-label="Scoring timeline"></div><p class="chart-summary" data-score-summary></p></section>
    <details class="chart-data"><summary>Text game data</summary><div data-chart-data></div></details><h3 class="drive-heading">CURRENT DRIVE</h3><div class="drive" data-drive></div>
    <div class="remote-help"><span>▲</span> Open / close with Fire TV remote</div>
  </aside>`
}

async function setupVideo() {
  if (!streamUrl) return
  const video = document.querySelector<HTMLVideoElement>('#program-video')
  if (!video) return
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = streamUrl
    video.play().catch(() => undefined)
    return
  }
  const {default: Hls} = await import('hls.js')
  if (Hls.isSupported()) {
    const hls = new Hls({lowLatencyMode: true, backBufferLength: 30})
    hls.loadSource(streamUrl)
    hls.attachMedia(video)
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => undefined))
  }
}

function text(selector: string, value: string) {
  document.querySelectorAll<HTMLElement>(selector).forEach((el) => { el.textContent = value })
}

function update(s: GameState, previous?: GameState | null) {
  state = s
  text('[data-away-short]', s.away.short)
  text('[data-home-short]', s.home.short)
  text('[data-away-score]', String(s.away.score))
  text('[data-home-score]', String(s.home.score))
  text('[data-quarter]', `Q${s.quarter}`)
  text('[data-down]', `${ordinal(s.down)} & ${s.distance}`)
  text('[data-spot]', `${s.possession === 'home' ? s.home.short : s.away.short} ${s.ballOn}`)
  text('[data-caption]', s.caption)
  text('[data-op-down]', String(s.down))
  text('[data-op-distance]', String(s.distance))
  text('[data-op-ball]', String(s.ballOn))
  text('[data-drawer-quarter]', `Q${s.quarter}`)
  text('[data-drawer-down]', `${ordinal(s.down)} & ${s.distance}`)
  text('[data-drawer-ball]', String(s.ballOn))

  document.querySelectorAll('[data-home-possession]').forEach((el) => el.classList.toggle('has-ball', s.possession === 'home'))
  document.querySelectorAll('[data-away-possession]').forEach((el) => el.classList.toggle('has-ball', s.possession === 'away'))
  const clockButton = document.querySelector<HTMLElement>('[data-clock-button]')
  if (clockButton) clockButton.textContent = s.clock.running ? 'STOP' : 'START'

  const drive = document.querySelector<HTMLElement>('[data-drive]')
  if (drive) drive.innerHTML = s.drive.length
    ? s.drive.slice().reverse().map((x, i) => `<div class="drive-event ${i === 0 ? 'latest' : ''}"><span>${String(x.seq).padStart(2,'0')}</span><b>${esc(x.text)}</b></div>`).join('')
    : '<p class="empty-drive">Waiting for the first snap.</p>'

  if (previous) detectSting(previous, s)
  if (drawerOpen) void ensureGameCenter()
  refreshClock()
}

function detectSting(before: GameState, after: GameState) {
  if (after.home.score > before.home.score) showSting('SCORE', after.home.short, `+${after.home.score - before.home.score}`)
  else if (after.away.score > before.away.score) showSting('SCORE', after.away.short, `+${after.away.score - before.away.score}`)
  else if (after.possession !== before.possession) showSting('POSSESSION', after.possession === 'home' ? after.home.short : after.away.short, `BALL ON ${after.ballOn}`)
}

function showSting(kicker: string, title: string, sub: string) {
  const sting = document.querySelector<HTMLElement>('[data-sting]')
  if (!sting) return
  text('[data-sting-kicker]', kicker); text('[data-sting-title]', title); text('[data-sting-sub]', sub)
  sting.classList.remove('show'); void sting.offsetWidth; sting.classList.add('show'); sting.setAttribute('aria-hidden','false')
  if (stingTimer) clearTimeout(stingTimer)
  stingTimer = window.setTimeout(() => { sting.classList.remove('show'); sting.setAttribute('aria-hidden','true') }, 2200)
}

function ordinal(n: number) { return n === 1 ? '1ST' : n === 2 ? '2ND' : n === 3 ? '3RD' : `${n}TH` }

async function ensureGameCenter() {
  if (mode !== 'viewer' || !state) return
  gameCenterModule ??= await import('./game-center')
  await gameCenterModule.renderGameCenter(state, api('events'))
  window.setTimeout(() => gameCenterModule?.resizeGameCenter(), 360)
}

function toggleDrawer(force?: boolean) {
  drawerOpen = force ?? !drawerOpen
  const drawer = document.querySelector<HTMLElement>('[data-drawer]')
  drawer?.classList.toggle('open', drawerOpen)
  drawer?.setAttribute('aria-hidden', String(!drawerOpen))
  document.querySelectorAll<HTMLElement>('[data-action="drawer"]').forEach((el) => el.setAttribute('aria-expanded', String(drawerOpen)))
  if (drawerOpen) void ensureGameCenter()
}

function bind() {
  document.querySelectorAll<HTMLButtonElement>('[data-action="drawer"]').forEach((button) => button.onclick = () => toggleDrawer())
  document.querySelectorAll<HTMLButtonElement>('[data-cmd]').forEach((button) => button.onclick = async () => {
    if (!state) return
    button.classList.add('fired'); window.setTimeout(() => button.classList.remove('fired'), 180)
    switch (button.dataset.cmd) {
      case 'away7': await send({type:'SCORE', team:'away', points:7}); break
      case 'home7': await send({type:'SCORE', team:'home', points:7}); break
      case 'away3': await send({type:'SCORE', team:'away', points:3}); break
      case 'home3': await send({type:'SCORE', team:'home', points:3}); break
      case 'down': await send({type:'SET_DOWN', down: state.down === 4 ? 1 : state.down + 1}); break
      case 'distance-minus': await send({type:'SET_DISTANCE', distance: Math.max(1, state.distance - 1)}); break
      case 'distance-plus': await send({type:'SET_DISTANCE', distance: state.distance + 1}); break
      case 'ball-minus': await send({type:'SET_BALL_ON', ballOn: Math.max(1, state.ballOn - 5)}); break
      case 'ball-plus': await send({type:'SET_BALL_ON', ballOn: Math.min(99, state.ballOn + 5)}); break
      case 'possession': await send({type:'SET_POSSESSION', team: state.possession === 'home' ? 'away' : 'home'}); break
      case 'clock': await send({type: state.clock.running ? 'STOP_CLOCK' : 'START_CLOCK'}); break
      case 'quarter': await send({type:'SET_QUARTER', quarter: state.quarter + 1}); break
      case 'caption': await send({type:'CAPTION', text: document.querySelector<HTMLTextAreaElement>('#caption-input')?.value || ''}); break
    }
  })
}

function refreshClock() {
  if (!state) return
  const value = fmt(visibleClock(state))
  text('[data-clock]', value)
  text('[data-op-clock]', value)
}

async function connect() {
  try {
    const response = await fetch(api('state'))
    const data = await response.json() as {state: GameState}
    state = data.state
    buildShell(data.state)
  } catch {
    root.innerHTML = '<main id="main-content" tabindex="-1" class="loading">Waiting for Fire Producer…</main>'
  }

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(`${proto}//${location.host}${api('ws')}`)
  ws.onopen = () => { connected = true; updateConnection(); announceStatus('Fire Producer connected') }
  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data)
      if (message.state) {
        const previous = state
        if (!root.querySelector('.shell')) buildShell(message.state)
        else update(message.state, previous)
      }
    } catch {}
  }
  ws.onclose = () => { connected = false; updateConnection(); announceStatus('Fire Producer connection lost. Reconnecting.'); window.setTimeout(connectSocketOnly, 1200) }
}

function connectSocketOnly() { location.reload() }
function updateConnection() {
  const el = document.querySelector<HTMLElement>('[data-connection]')
  if (!el) return
  el.classList.toggle('online', connected)
  const label = el.querySelector('span'); if (label) label.textContent = connected ? 'ON AIR' : 'RECONNECTING'
}

document.addEventListener('keydown', (event) => {
  if (mode !== 'viewer') return
  if (event.key === 'ArrowUp') { event.preventDefault(); toggleDrawer() }
  if (event.key === 'Escape' || event.key === 'Backspace') toggleDrawer(false)
})

if (composite) {
  import('./composite-production').then(({startCompositeProduction}) => startCompositeProduction(root, slug, params.get('news') || 'evening', params.get('weather') || 'baltimore', params.get('captions') || 'main'))
} else if (cartridgeId === 'captions') {
  import('./caption-production').then(({startCaptionProduction}) => startCaptionProduction(root, productionSlug, mode))
} else if (cartridgeId === 'news' || cartridgeId === 'weather') {
  import('./cartridge-production').then(({startCartridgeProduction}) => startCartridgeProduction({root,cartridgeId,slug:productionSlug,mode}))
} else {
  connect()
  setInterval(refreshClock, 200)
}
