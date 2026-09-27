import type {CaptionState} from './cartridges/captions'

type Mode='viewer'|'operator'
const esc=(value:string)=>value.replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const id=()=>crypto.randomUUID()

export function startCaptionProduction(root:HTMLDivElement,slug='main',mode:Mode='viewer'){
  const api=(action:string)=>`/api/events/captions/${encodeURIComponent(slug)}/${action}`
  let state:CaptionState|null=null
  let connected=false
  let partialTimer:number|undefined

  async function send(command:Record<string,unknown>){
    const response=await fetch(api('command'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...command,idempotencyKey:id()})})
    if(!response.ok){const body=await response.json().catch(()=>({})) as {error?:string};throw new Error(body.error||`caption command failed: ${response.status}`)}
  }

  function shell(){
    root.innerHTML=`<main class="shell captions-shell ${mode}">
      <header class="topbar"><div class="brand-lockup"><span class="fire-mark"><i></i><i></i><i></i></span><div><strong>FIRE PRODUCER</strong><small>LIVE CAPTIONS</small></div></div><div class="topbar-right"><span class="connection" data-caption-connection><i></i><span>CONNECTING</span></span><nav><a class="${mode==='viewer'?'active':''}" href="?cartridge=captions&event=${encodeURIComponent(slug)}&mode=viewer">Viewer</a><a class="${mode==='operator'?'active':''}" href="?cartridge=captions&event=${encodeURIComponent(slug)}&mode=operator">Captioner</a></nav></div></header>
      <div class="cartridge-title"><span>CAPTIONS CARTRIDGE</span><strong>${esc(slug)}</strong></div>
      <section class="caption-program">
        <div class="caption-program-grid"></div>
        <div class="program-id"><span class="live-dot"></span> <span data-caption-status-label>LIVE</span> <b>${esc(slug.toUpperCase())}</b></div>
        <div class="caption-stage-cue" data-caption-cue aria-live="polite"><small data-caption-speaker></small><strong data-caption-text>Waiting for live captions…</strong><em data-caption-kind></em></div>
      </section>
      ${mode==='operator'?operatorPanel():viewerPanel()}
    </main>`
    bind()
    update()
  }

  function operatorPanel(){return `<section class="producer-console caption-console"><div class="console-head"><div><small>CAPTION CONTROL</small><h1>Live caption runway</h1></div><div class="caption-status-control"><button data-caption-action="status" data-status-button>PAUSE</button><span class="tally"><span></span>STREAMING</span></div></div><div class="caption-control-grid">
    <section class="control-bank caption-input-bank"><h2>Speaker</h2><input id="caption-speaker" value="Announcer" maxlength="80"><h2>Live text</h2><textarea id="caption-live-input" rows="5" maxlength="500" placeholder="Type here. Partial captions stream while you type. Enter commits the cue; Shift+Enter adds a line."></textarea><div class="caption-actions"><button class="primary" data-caption-action="commit">COMMIT CUE</button><button data-caption-action="clear">CLEAR PROGRAM</button></div><small class="caption-help">Live partials stream after 120 ms · Enter commits · Shift+Enter inserts a line</small></section>
    <section class="control-bank transcript-bank"><h2>Recent transcript</h2><div class="caption-transcript" data-caption-transcript></div></section>
  </div></section>`}

  function viewerPanel(){return `<section class="caption-viewer-panel"><div><small>STATUS</small><b data-caption-view-status>LIVE</b></div><div><small>LANGUAGE</small><b data-caption-language>en-US</b></div><div class="caption-viewer-transcript"><small>RECENT TRANSCRIPT</small><div class="caption-transcript" data-caption-transcript></div></div></section>`}

  function update(){
    if(!state)return
    const current=state.current
    document.querySelectorAll<HTMLElement>('[data-caption-text]').forEach(el=>{el.textContent=current?.text||'Waiting for live captions…';el.classList.toggle('partial',!!current&&!current.final)})
    document.querySelectorAll<HTMLElement>('[data-caption-speaker]').forEach(el=>el.textContent=current?.speaker?current.speaker.toUpperCase():'')
    document.querySelectorAll<HTMLElement>('[data-caption-kind]').forEach(el=>el.textContent=current?(current.final?'FINAL':'LIVE PARTIAL'):'')
    document.querySelectorAll<HTMLElement>('[data-caption-status-label],[data-caption-view-status]').forEach(el=>el.textContent=state!.status.toUpperCase())
    document.querySelectorAll<HTMLElement>('[data-caption-language]').forEach(el=>el.textContent=state!.language)
    const statusButton=document.querySelector<HTMLButtonElement>('[data-status-button]');if(statusButton)statusButton.textContent=state.status==='live'?'PAUSE':'GO LIVE'
    const conn=document.querySelector<HTMLElement>('[data-caption-connection]');if(conn){conn.classList.toggle('online',connected);const label=conn.querySelector('span');if(label)label.textContent=connected?'ON AIR':'RECONNECTING'}
    const history=state.history.slice(-12).reverse()
    document.querySelectorAll<HTMLElement>('[data-caption-transcript]').forEach(el=>el.innerHTML=history.length?history.map(cue=>`<div class="caption-history-row"><span>${String(cue.seq).padStart(3,'0')}</span><div>${cue.speaker?`<small>${esc(cue.speaker)}</small>`:''}<b>${esc(cue.text)}</b></div></div>`).join(''):'<p class="empty-drive">No committed captions yet.</p>')
  }

  function bind(){
    const input=document.querySelector<HTMLTextAreaElement>('#caption-live-input')
    input?.addEventListener('input',()=>{
      if(!state||state.status!=='live')return
      if(partialTimer)clearTimeout(partialTimer)
      partialTimer=window.setTimeout(()=>{void send({type:'SET_PARTIAL',speaker:(document.querySelector<HTMLInputElement>('#caption-speaker')?.value||''),text:input.value}).catch(()=>undefined)},120)
    })
    input?.addEventListener('keydown',(event)=>{
      if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void commit()}
    })
    document.querySelectorAll<HTMLButtonElement>('[data-caption-action]').forEach(button=>button.onclick=()=>{
      switch(button.dataset.captionAction){
        case 'commit': void commit();break
        case 'clear': void send({type:'CLEAR'});break
        case 'status': if(state)void send({type:'SET_STATUS',status:state.status==='live'?'paused':'live'});break
      }
    })
  }

  async function commit(){
    const input=document.querySelector<HTMLTextAreaElement>('#caption-live-input');if(!input)return
    const text=input.value.trim();if(!text)return
    const speaker=document.querySelector<HTMLInputElement>('#caption-speaker')?.value||''
    await send({type:'COMMIT',speaker,text})
    input.value=''
  }

  async function connect(){
    const response=await fetch(api('state'));const payload=await response.json() as {state:CaptionState};state=payload.state;shell()
    const proto=location.protocol==='https:'?'wss:':'ws:'
    const ws=new WebSocket(`${proto}//${location.host}${api('ws')}`)
    ws.onopen=()=>{connected=true;update()}
    ws.onmessage=(event)=>{try{const message=JSON.parse(event.data);if(message.state){state=message.state;update()}}catch{}}
    ws.onclose=()=>{connected=false;update();window.setTimeout(connect,1000)}
  }

  void connect()
}
