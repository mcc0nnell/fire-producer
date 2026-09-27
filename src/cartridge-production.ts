import type {NewsState, NewsCommand} from './cartridges/news'
import type {WeatherState, WeatherCommand} from './cartridges/weather'

type Mode = 'viewer' | 'operator'
type Cartridge = 'news' | 'weather'
type AnyState = NewsState | WeatherState

type StartOptions = {
  root: HTMLDivElement
  cartridgeId: Cartridge
  slug: string
  mode: Mode
}

const esc = (value:string) => value.replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const key = () => crypto.randomUUID()

export function startCartridgeProduction({root,cartridgeId,slug,mode}:StartOptions) {
  const api=(action:string)=>`/api/events/${cartridgeId}/${encodeURIComponent(slug)}/${action}`
  let state:AnyState|null=null
  let connected=false

  async function send(command:Omit<NewsCommand,'idempotencyKey'>|Omit<WeatherCommand,'idempotencyKey'>|Record<string,unknown>) {
    const response=await fetch(api('command'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...command,idempotencyKey:key()})})
    if (!response.ok) throw new Error(`command failed: ${response.status}`)
  }

  function chrome(title:string, subtitle:string, content:string, controls='') {
    root.innerHTML=`<main class="shell cartridge-shell ${cartridgeId}-shell ${mode}">
      <header class="topbar">
        <div class="brand-lockup"><span class="fire-mark"><i></i><i></i><i></i></span><div><strong>FIRE PRODUCER</strong><small>${esc(subtitle)}</small></div></div>
        <div class="topbar-right"><span class="connection ${connected?'online':''}" data-cartridge-connection><i></i><span>${connected?'ON AIR':'CONNECTING'}</span></span>
          <nav><a class="${mode==='viewer'?'active':''}" href="?cartridge=${cartridgeId}&event=${encodeURIComponent(slug)}&mode=viewer">Viewer</a><a class="${mode==='operator'?'active':''}" href="?cartridge=${cartridgeId}&event=${encodeURIComponent(slug)}&mode=operator">Producer</a></nav>
        </div>
      </header>
      <div class="cartridge-title"><span>${cartridgeId.toUpperCase()} CARTRIDGE</span><strong>${esc(title)}</strong></div>
      ${content}${controls}
    </main>`
    bind()
  }

  function render() {
    if (!state) { root.innerHTML='<main class="loading">Loading event cartridge…</main>'; return }
    if (cartridgeId==='news') renderNews(state as NewsState)
    else renderWeather(state as WeatherState)
  }

  function renderNews(s:NewsState) {
    const story=s.story
    const lower=s.lowerThird
    const breaking=s.breaking
    const ticker=s.ticker.length?s.ticker:['Fire Producer news cartridge online']
    const stage=`<section class="stage news-stage">
      <div class="news-program-bg"><div class="news-grid"></div><div class="news-orbit"></div></div>
      <div class="program-id"><span class="live-dot"></span> LIVE <b>NEWS</b></div>
      <div class="network-bug">${esc(slug.toUpperCase())} <span>•</span> PROGRAM</div>
      <div class="news-desk">
        <small>${story?'NOW LIVE':'STANDBY'}</small>
        <h1>${esc(story?.headline || 'Evening News')}</h1>
        <p>${esc(story?.deck || 'Select a story from the producer surface to take it live.')}</p>
      </div>
      ${breaking?`<div class="breaking-strap"><b>BREAKING</b><span>${esc(breaking)}</span></div>`:''}
      ${lower?`<div class="news-lower-third"><strong>${esc(lower.name)}</strong><span>${esc(lower.title)}</span></div>`:''}
      <div class="news-ticker"><b>LIVE</b><div class="ticker-track">${ticker.map((x)=>`<span>${esc(x)}</span>`).join('<i>◆</i>')}</div></div>
      ${s.caption?`<div class="caption-wrap"><div class="caption">${esc(s.caption)}</div></div>`:''}
    </section>`
    const controls=mode==='operator'?`<section class="producer-console news-console"><div class="console-head"><div><small>NEWS CONTROL</small><h1>Rundown / graphics</h1></div><div class="tally"><span></span>PROGRAM LIVE</div></div><div class="news-control-grid">
      <section class="control-bank"><h2>Story</h2><input id="news-headline" value="${esc(story?.headline||'Harbor redevelopment plan moves forward')}"><textarea id="news-deck" rows="3">${esc(story?.deck||'Live coverage from the evening desk')}</textarea><button class="primary" data-news="story">TAKE STORY</button></section>
      <section class="control-bank"><h2>Lower third</h2><input id="news-name" value="${esc(lower?.name||'Maya Chen')}"><input id="news-title" value="${esc(lower?.title||'Reporter • City Desk')}"><button data-news="lower">TAKE LOWER THIRD</button><button data-news="clear-lower">CLEAR</button></section>
      <section class="control-bank"><h2>Breaking</h2><textarea id="news-breaking" rows="3">${esc(breaking||'Breaking news from the Fire Producer desk')}</textarea><button class="danger" data-news="breaking">TAKE BREAKING</button><button data-news="clear-breaking">CLEAR BREAKING</button></section>
    </div></section>`:''
    chrome(story?.headline||'Evening News','LIVE NEWS PRODUCTION',stage,controls)
  }

  function renderWeather(s:WeatherState) {
    const current=s.current
    const forecast=s.forecast
    const alert=s.alert
    const stage=`<section class="stage weather-stage ${alert?`weather-alert-${alert.severity}`:''}">
      <div class="weather-sky"><div class="weather-glow"></div><div class="weather-lines"></div></div>
      <div class="program-id"><span class="live-dot"></span> LIVE <b>WEATHER</b></div>
      <div class="network-bug">${esc((s.location||slug).toUpperCase())} <span>•</span> PROGRAM</div>
      <div class="weather-current"><small>CURRENT CONDITIONS</small><h1>${current?`${current.temperature}°`: '—'}</h1><strong>${esc(current?.condition||'Standby')}</strong><span>${esc(current?.wind||'')}</span></div>
      <div class="weather-location">${esc(s.location||slug)}</div>
      <div class="forecast-strip">${forecast.length?forecast.map((p)=>`<article><small>${esc(p.label)}</small><b>${p.temperature}°</b><span>${esc(p.condition)}</span><em>${p.precipPct??0}% precip</em></article>`).join(''):'<article><small>FORECAST</small><b>—</b><span>Waiting for forecast data</span></article>'}</div>
      ${alert?`<div class="weather-alert"><b>${esc(alert.severity.toUpperCase())}</b><span>${esc(alert.headline)}</span></div>`:''}
      ${s.caption?`<div class="caption-wrap"><div class="caption">${esc(s.caption)}</div></div>`:''}
    </section>`
    const controls=mode==='operator'?`<section class="producer-console weather-console"><div class="console-head"><div><small>WEATHER CONTROL</small><h1>Conditions / alerts</h1></div><div class="tally"><span></span>PROGRAM LIVE</div></div><div class="weather-control-grid">
      <section class="control-bank"><h2>Current</h2><input id="weather-location" value="${esc(s.location||'Baltimore, MD')}"><div class="weather-input-row"><input id="weather-temp" inputmode="numeric" value="${current?.temperature??72}"><input id="weather-condition" value="${esc(current?.condition||'Clear')}"></div><input id="weather-wind" value="${esc(current?.wind||'NW 6 mph')}"><button class="primary" data-weather="current">TAKE CONDITIONS</button></section>
      <section class="control-bank"><h2>Alert</h2><input id="weather-alert-headline" value="${esc(alert?.headline||'Severe thunderstorm warning')}"><textarea id="weather-alert-detail" rows="3">${esc(alert?.detail||'Move indoors and remain away from windows.')}</textarea><button class="danger" data-weather="warning">TAKE WARNING</button><button data-weather="clear-alert">CLEAR ALERT</button></section>
      <section class="control-bank"><h2>Caption</h2><textarea id="weather-caption" rows="3">${esc(s.caption||'Your local forecast from Fire Producer.')}</textarea><button data-weather="caption">TAKE CAPTION</button></section>
    </div></section>`:''
    chrome(s.location||'Weather','LIVE WEATHER PRODUCTION',stage,controls)
  }

  function value(id:string) { return (document.querySelector<HTMLInputElement|HTMLTextAreaElement>(`#${id}`)?.value||'').trim() }

  function bind() {
    document.querySelectorAll<HTMLButtonElement>('[data-news]').forEach((button)=>button.onclick=async()=>{
      switch(button.dataset.news) {
        case 'story': await send({type:'SET_STORY',slug:`story-${Date.now()}`,headline:value('news-headline'),deck:value('news-deck')}); break
        case 'lower': await send({type:'SET_LOWER_THIRD',name:value('news-name'),title:value('news-title')}); break
        case 'clear-lower': await send({type:'CLEAR_LOWER_THIRD'}); break
        case 'breaking': await send({type:'BREAKING',text:value('news-breaking')}); break
        case 'clear-breaking': await send({type:'CLEAR_BREAKING'}); break
      }
    })
    document.querySelectorAll<HTMLButtonElement>('[data-weather]').forEach((button)=>button.onclick=async()=>{
      switch(button.dataset.weather) {
        case 'current': {
          const temperature=Number(value('weather-temp'))
          await send({type:'SET_LOCATION',location:value('weather-location')})
          await send({type:'SET_CURRENT',temperature:Number.isFinite(temperature)?temperature:72,unit:'F',condition:value('weather-condition'),wind:value('weather-wind')})
          break
        }
        case 'warning': await send({type:'SET_ALERT',severity:'warning',headline:value('weather-alert-headline'),detail:value('weather-alert-detail')}); break
        case 'clear-alert': await send({type:'CLEAR_ALERT'}); break
        case 'caption': await send({type:'CAPTION',text:value('weather-caption')}); break
      }
    })
  }

  async function connect() {
    try {
      const response=await fetch(api('state'))
      const payload=await response.json() as {state:AnyState}
      state=payload.state
      render()
    } catch { root.innerHTML='<main class="loading">Waiting for event authority…</main>' }

    const proto=location.protocol==='https:'?'wss:':'ws:'
    const ws=new WebSocket(`${proto}//${location.host}${api('ws')}`)
    ws.onopen=()=>{connected=true;render()}
    ws.onmessage=(event)=>{try{const message=JSON.parse(event.data);if(message.state){state=message.state;render()}}catch{}}
    ws.onclose=()=>{connected=false;render();window.setTimeout(()=>location.reload(),1200)}
  }

  void connect()
}
