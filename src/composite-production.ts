import {visibleClock, type GameState} from './core/game'
import type {NewsState} from './cartridges/news'
import type {WeatherState} from './cartridges/weather'

type CompositeState = {football:GameState|null; news:NewsState|null; weather:WeatherState|null}
type Channel = keyof CompositeState

const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const fmt=(ms:number)=>{const t=Math.ceil(ms/1000);return `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`}

export function startCompositeProduction(root:HTMLDivElement, footballSlug='demo', newsSlug='evening', weatherSlug='baltimore') {
  const state:CompositeState={football:null,news:null,weather:null}
  const connected=new Set<Channel>()
  const routes:Record<Channel,string>={
    football:`/api/events/football/${encodeURIComponent(footballSlug)}`,
    news:`/api/events/news/${encodeURIComponent(newsSlug)}`,
    weather:`/api/events/weather/${encodeURIComponent(weatherSlug)}`,
  }

  function render() {
    const f=state.football, n=state.news, w=state.weather
    if(!f||!n||!w){root.innerHTML='<main class="loading">Mounting event cartridges…</main>';return}
    const alert=w.alert
    const breaking=n.breaking
    const overlay=alert
      ? `<div class="priority-overlay emergency"><b>${esc(alert.severity.toUpperCase())}</b><span>${esc(alert.headline)}</span><small>WEATHER • PRIORITY 100</small></div>`
      : breaking
        ? `<div class="priority-overlay breaking"><b>BREAKING</b><span>${esc(breaking)}</span><small>NEWS • PRIORITY 80</small></div>`
        : ''
    const ticker=n.ticker.length?n.ticker:['Fire Producer composite program online']
    root.innerHTML=`<main class="shell composite-shell">
      <header class="topbar"><div class="brand-lockup"><span class="fire-mark"><i></i><i></i><i></i></span><div><strong>FIRE PRODUCER</strong><small>COMPOSITE PROGRAM</small></div></div><div class="topbar-right"><span class="connection ${connected.size===3?'online':''}"><i></i><span>${connected.size}/3 CARTRIDGES</span></span><nav><a href="?mode=viewer&game=${encodeURIComponent(footballSlug)}">Football</a><a class="active" href="?composite=friday-night">Program</a></nav></div></header>
      <div class="cartridge-title"><span>COMPOSITE PRODUCTION</span><strong>Friday Night Live</strong></div>
      <section class="stage composite-stage">
        <div class="synthetic-field"><div class="stadium-glow"></div><div class="field-plane">${[10,20,30,40,50,40,30,20,10].map((yard,i)=>`<span class="yard" style="--i:${i}"><b>${yard}</b></span>`).join('')}<div class="mid-logo"><span>FIRE</span><b>PRODUCER</b></div></div></div>
        <div class="broadcast-shade"></div><div class="program-id"><span class="live-dot"></span> LIVE <b>COMPOSITE</b></div><div class="network-bug">3 CARTRIDGES <span>•</span> 1 PROGRAM</div>
        <div class="scorebug"><div class="teams"><div class="team away ${f.possession==='away'?'has-ball':''}"><span class="possession-arrow">▶</span><b>${esc(f.away.short)}</b><strong>${f.away.score}</strong></div><div class="team home ${f.possession==='home'?'has-ball':''}"><span class="possession-arrow">▶</span><b>${esc(f.home.short)}</b><strong>${f.home.score}</strong></div></div><div class="game-strip"><span class="quarter">Q${f.quarter}</span><strong class="clock">${fmt(visibleClock(f))}</strong><span class="down">${f.down}${f.down===1?'ST':f.down===2?'ND':f.down===3?'RD':'TH'} & ${f.distance}</span><span class="spot">${f.ballOn}</span></div></div>
        <aside class="weather-bug"><small>${esc(w.location||weatherSlug)}</small><strong>${w.current?`${w.current.temperature}°`:'—'}</strong><span>${esc(w.current?.condition||'')}</span></aside>
        ${n.lowerThird?`<div class="news-lower-third composite-lower"><strong>${esc(n.lowerThird.name)}</strong><span>${esc(n.lowerThird.title)}</span></div>`:''}
        ${overlay}
        <div class="news-ticker composite-ticker"><b>LIVE</b><div class="ticker-track">${ticker.map(x=>`<span>${esc(x)}</span>`).join('<i>◆</i>')}</div></div>
      </section>
      <section class="composition-rack"><div class="console-head"><div><small>CARTRIDGE RACK</small><h1>Mounted capabilities</h1></div><div class="tally"><span></span>PRIORITY ARBITRATION LIVE</div></div><div class="rack-grid">
        <article><span class="rack-status online"></span><small>PRIORITY 50</small><b>Football</b><p>Scorebug · clock · situation · Game Center</p></article>
        <article><span class="rack-status online"></span><small>PRIORITY 80</small><b>News</b><p>Lower thirds · breaking · ticker · stories</p></article>
        <article><span class="rack-status online"></span><small>PRIORITY 100</small><b>Weather</b><p>Conditions · forecast · warning override</p></article>
      </div></section>
    </main>`
  }

  async function mount(channel:Channel) {
    const base=routes[channel]
    const response=await fetch(`${base}/state`)
    const payload=await response.json() as {state:CompositeState[Channel]}
    ;(state as Record<Channel,CompositeState[Channel]>)[channel]=payload.state
    render()
    const proto=location.protocol==='https:'?'wss:':'ws:'
    const ws=new WebSocket(`${proto}//${location.host}${base}/ws`)
    ws.onopen=()=>{connected.add(channel);render()}
    ws.onmessage=(event)=>{try{const message=JSON.parse(event.data);if(message.state){(state as Record<Channel,CompositeState[Channel]>)[channel]=message.state;render()}}catch{}}
    ws.onclose=()=>{connected.delete(channel);render();setTimeout(()=>mount(channel),1000)}
  }

  void Promise.all([mount('football'),mount('news'),mount('weather')])
}
