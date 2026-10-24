import type {ConferenceState, ConferenceSession, ConferenceRoom, SessionStatus, SignalId, SignalStatus} from './cartridges/conference'
import {announceStatus} from './a11y'
import {plannerMarkup} from './conference/planner-ui'
import {defaultProductionPlan,assessReadiness,rehearse,type RehearsalScenario,type RehearsalReport,type RouteKey,ROUTES} from './conference/planning'

const DAYS=['2027-04-28','2027-04-29','2027-04-30']
const SIGNALS:SignalId[]=['audio','video','captions','asl','recording','network','tronix']
const STATUSES:SessionStatus[]=['scheduled','ready','live','delayed','ended']
const HOURS=Array.from({length:12},(_,i)=>i+8)
const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const minutes=(hhmm:string)=>Number(hhmm.slice(0,2))*60+Number(hhmm.slice(3,5))
const timeLabel=(hhmm:string)=>{
  const [h,m]=hhmm.split(':').map(Number)
  return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`
}
const dayLabel=(value:string)=>new Date(value+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',weekday:'short'})
const api=(slug:string,action:string)=>`/api/events/conference/${encodeURIComponent(slug)}/${action}`

export function startConferenceProduction(root:HTMLDivElement,slug='dc27',mode:'viewer'|'operator'='viewer') {
  let state:ConferenceState|null=null
  let selectedDay=DAYS[0]
  let selectedId='demo-open'
  let connected=false
  let token=''
  let busy=false
  let lastError=''
  let socket:WebSocket|null=null
  let reconnectDelay=1200
  let rehearsalReport:RehearsalReport|null=null

  function sessionCard(s:ConferenceSession) {
    const left=Math.max(0,(minutes(s.start)-480)/660*100)
    const right=Math.min(100,(minutes(s.end)-480)/660*100)
    if(right<=left) return ''
    const width=Math.max(1,right-left)
    const content=`<span class="conf-card-time">${esc(timeLabel(s.start))}–${esc(timeLabel(s.end))}</span>
      <strong>${esc(s.title)}</strong><span class="conf-card-speaker">${esc(s.speaker)}</span>
      <span class="conf-status conf-${s.status}">${s.status.toUpperCase()}</span>`
    return mode==='operator'
      ? `<button class="conf-session-card ${s.status} ${selectedId===s.id?'selected':''}" data-select="${esc(s.id)}" style="left:${left}%;width:${width}%" aria-label="${esc(s.title)}, ${esc(s.status)}, ${esc(timeLabel(s.start))} to ${esc(timeLabel(s.end))}">${content}</button>`
      : `<article class="conf-session-card ${s.status}" style="left:${left}%;width:${width}%">${content}</article>`
  }

  function grid(state:ConferenceState){
    return `<section class="conf-grid-panel" aria-label="Conference session timeline">
      <div class="conf-grid-label">ROOM / TIME</div>
      <div class="conf-ticks" aria-hidden="true">${HOURS.map((h,i)=>`<span style="left:${i/11*100}%">${h%12||12} ${h>=12?'PM':'AM'}</span>`).join('')}</div>
      ${state.rooms.map(room=>{
        const sessions=state.sessions.filter(s=>s.date===selectedDay&&s.roomId===room.id)
        const live=sessions.some(s=>s.status==='live')
        return `<div class="conf-room-label"><strong>${esc(room.name)}</strong><small>${live?'● LIVE':'STANDBY'}</small></div>
          <div class="conf-room-track">${HOURS.map((h,i)=>`<i style="left:${i/11*100}%"></i>`).join('')}
          ${sessions.map(sessionCard).join('')}
          ${sessions.length?'':'<span class="conf-empty">No sessions entered</span>'}</div>`
      }).join('')}
    </section>`
  }

  function health(state:ConferenceState,roomId:string){
    return `<section class="conf-bank" aria-label="Room readiness">
      <h3>Readiness <small>ROOM SIGNALS MANUALLY REPORTED · TRONIX IS SCHEDULER REACHABILITY</small></h3>
      <div class="conf-signals">${SIGNALS.map(signal=>{
        const location=signal==='tronix'?'show':roomId
        const entry=state.signals.find(s=>s.roomId===location&&s.signal===signal)
        const value=entry?.status||'unknown'
        if(signal==='tronix')return `<div class="conf-signal conf-tronix"><span>TRONIX IPC</span><strong>${value.toUpperCase()}</strong><small>${esc(entry?.note||'Local bridge not reporting')}</small></div>`
        return `<label class="conf-signal"><span>${signal==='asl'?'ASL':esc(signal.toUpperCase())}</span>
          <select data-signal="${signal}" data-room="${esc(roomId)}" aria-label="${esc(signal)} status for ${esc(roomId)}">
          ${(['unknown','ok','warning','fault'] as SignalStatus[]).map(x=>`<option value="${x}" ${x===value?'selected':''}>${x.toUpperCase()}</option>`).join('')}</select></label>`
      }).join('')}</div>
    </section>`
  }

  function operatorConsole(state:ConferenceState){
    const s=state.sessions.find(s=>s.id===selectedId)
    const roomId=s?.roomId||'main'
    const room=state.rooms.find(x=>x.id===roomId)
    return `<section class="conf-console" aria-label="Operator controls">
      <div class="conf-console-head"><div><small>SOLO PRODUCER / CONTROL PLANE</small><h2>Production control</h2></div>
        <span class="conf-armed">${token?'TOKEN ENTERED · NOT YET VERIFIED':'READ ONLY UNTIL TOKEN ENTERED'}</span></div>
      <div class="conf-banks">
        <section class="conf-bank"><h3>Operator authorization</h3>
          <label for="conf-token">Conference production token</label>
          <div class="conf-token-row"><input id="conf-token" type="password" autocomplete="off" placeholder="Enter token (held in memory only)" value="">
            <button data-token="set">${token?'REPLACE':'ARM CONTROLS'}</button></div>
          <small>The Worker must have the PRODUCER_TOKEN secret configured; no default access.</small>
        </section>
        <section class="conf-bank"><h3>Selected session</h3>
          ${s?`<strong class="conf-selected-title">${esc(s.title)}</strong>
            <p>${esc(room?.name||'')} · ${esc(timeLabel(s.start))}–${esc(timeLabel(s.end))}</p>
            <div class="conf-buttons">${STATUSES.map(x=>`<button data-status="${x}" ${busy||!token?'disabled':''} ${s.status===x?'aria-current="true"':''}>${x==='live'?'TAKE LIVE':x.toUpperCase()}</button>`).join('')}</div>`
           :'<p>Choose a session in the grid to control its status.</p>'}
          <small>Status changes update the event journal. They do not switch hardware.</small>
        </section>
        ${health(state,roomId)}
        <section class="conf-bank"><h3>Stage cues <small>LOGGED · NO PHYSICAL OUTPUT</small></h3>
          <p>${esc(room?.name||'Main Stage')}</p>
          <div class="conf-buttons">${['STANDBY','ROLL VIDEO','GO','HOLD','CLEAR'].map(label=>`<button data-cue="${label}" ${busy||!token?'disabled':''}>${label}</button>`).join('')}</div>
          <small>Last cue: ${state.cue?`${esc(state.cue.label)} / ${esc(state.cue.roomId)} #${state.cue.seq}`:'none'}</small>
        </section>
        <section class="conf-bank"><h3>Add a session</h3>
          <form id="conf-add-session">
            <label for="conf-new-title">Session title</label><input id="conf-new-title" required maxlength="120" placeholder="Workshop title">
            <label for="conf-new-speaker">Presenter</label><input id="conf-new-speaker" maxlength="100" placeholder="Presenter / notes">
            <div class="conf-form-row">
              <label>Date<select id="conf-new-date">${DAYS.map(x=>`<option value="${x}" ${x===selectedDay?'selected':''}>${esc(dayLabel(x))}</option>`).join('')}</select></label>
              <label>Room<select id="conf-new-room">${state.rooms.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label>
              <label>Starts<input id="conf-new-start" type="time" value="13:00" required></label>
              <label>Ends<input id="conf-new-end" type="time" value="14:00" required></label>
            </div><button type="submit" ${busy||!token?'disabled':''}>ADD TO RUNDOWN</button>
          </form>
        </section>
      </div>
    </section>`
  }

  function render(){
    if(!state){root.innerHTML='<main class="loading" role="status">Connecting to conference authority…</main>';return}
    const live=state.sessions.filter(s=>s.status==='live')
    root.innerHTML=`<main id="main-content" tabindex="-1" class="shell conf-shell">
      <header class="topbar">
        <div class="brand-lockup"><span class="fire-mark"><i></i><i></i><i></i></span><div><strong>FIRE PRODUCER</strong><small>DC27 / CONFERENCE GRID</small></div></div>
        <div class="topbar-right"><span class="connection ${connected?'online':''}"><i></i><span>${connected?'AUTHORITY CONNECTED':'DISCONNECTED'}</span></span>
          <nav><a class="${mode==='viewer'?'active':''}" href="?cartridge=conference&event=${encodeURIComponent(slug)}&mode=viewer">Public board</a>
          <a class="${mode==='operator'?'active':''}" href="?cartridge=conference&event=${encodeURIComponent(slug)}&mode=operator">Producer</a></nav>
        </div>
      </header>
      <section class="conf-mast"><div><small>DIG NATIONAL TRAINING CONFERENCE / WASHINGTON, DC</small>
        <h1>DC<span>27</span> LIVE</h1><p>April 28–30, 2027 · Session operations</p></div>
        <div class="conf-mast-metrics"><div><b>${live.length}</b><span>SESSIONS LIVE</span></div><div><b>${state.rooms.length}</b><span>ROOMS</span></div><div><b>${state.lastSeq}</b><span>EVENTS LOGGED</span></div></div></section>
      <div class="conf-demo" role="note">PROTOTYPE · SAMPLE AGENDA ONLY — NOT THE OFFICIAL DC27 PROGRAM</div>
      <section class="conf-days" aria-label="Choose conference day">
        ${DAYS.map(x=>`<button data-day="${x}" ${selectedDay===x?'aria-pressed="true"':''}>${esc(dayLabel(x))}</button>`).join('')}
        <span>ALL TIMES EASTERN</span>
      </section>
      ${grid(state)}
      <div class="conf-bottom-bar"><span>LIVE CONFERENCE OPERATIONS · ${esc(state.eventName)}</span><strong>${state.message?esc(state.message):'Choose a session to see its current production status.'}</strong></div>
      ${mode==='operator'?operatorConsole(state)+plannerMarkup(state,selectedId,rehearsalReport?.sessionId===selectedId?rehearsalReport:null):`<section class="conf-viewer-note"><h2>Today's sessions</h2><p>Session statuses are published by the Fire Producer conference control plane. This board does not contain actual video, caption, or interpreter feeds.</p></section>`}
      <div class="conf-feedback" role="status" aria-live="polite">${lastError?esc(lastError):''}</div>
    </main>`
    bind()
  }

  async function send(command:Record<string,unknown>) {
    if(!token){lastError='Enter the operator token first.';render();return}
    busy=true;lastError='';render()
    try{
      const res=await fetch(api(slug,'command'),{method:'POST',
        headers:{'content-type':'application/json','authorization':`Bearer ${token}`},
        body:JSON.stringify({...command,idempotencyKey:crypto.randomUUID()})})
      const result=await res.json() as {error?:string;state?:ConferenceState}
      if(!res.ok) throw Error(result.error||`Command rejected (${res.status})`)
      if(result.state)state=result.state
      announceStatus('Conference command applied')
    }catch(e){lastError=e instanceof Error?e.message:'Command failed'}
    finally{busy=false;render()}
  }
  function input(id:string){return (document.getElementById(id) as HTMLInputElement|null)?.value||''}
  function draftPlan(){
    const session=state?.sessions.find(s=>s.id===selectedId)
    if(!session)return null
    const base=state?.plans.find(p=>p.sessionId===selectedId)||defaultProductionPlan(session)
    const routes={...base.routes}
    for(const key of ROUTES)routes[key as RouteKey]=input(`plan-${key}`).trim()
    return {...base,operator:input('plan-operator').trim(),fallbackMessage:input('plan-fallback').trim(),routes}
  }
  function bind(){
    root.querySelectorAll<HTMLButtonElement>('[data-day]').forEach(el=>el.onclick=()=>{selectedDay=el.dataset.day!;render()})
    root.querySelectorAll<HTMLButtonElement>('[data-select]').forEach(el=>el.onclick=()=>{selectedId=el.dataset.select!;rehearsalReport=null;render()})
    root.querySelector<HTMLButtonElement>('[data-token]')?.addEventListener('click',()=>{
      token=input('conf-token').trim();lastError=token?'Token stored in this tab until reload; it will be verified on command.':'Enter a token.'
      render()
    })
    root.querySelectorAll<HTMLButtonElement>('[data-status]').forEach(el=>el.onclick=()=>{
      if(el.dataset.status==='live'){
        const issues=state?assessReadiness(state,selectedId).issues:[]
        const question=issues.length?`OVERRIDE ${issues.length} unready planning/readiness gates? This only changes the published session status; no hardware is switched.`:'Mark this session LIVE on the board? This does not switch equipment.'
        if(!confirm(question))return
      }
      void send({type:'SET_SESSION_STATUS',sessionId:selectedId,status:el.dataset.status})
    })
    root.querySelectorAll<HTMLButtonElement>('[data-cue]').forEach(el=>el.onclick=()=>{
      const session=state?.sessions.find(x=>x.id===selectedId)
      void send({type:'TAKE_CUE',roomId:session?.roomId||'main',label:el.dataset.cue})
    })
    root.querySelectorAll('[data-signal]').forEach(node=>{
      const el=node as unknown as HTMLSelectElement
      el.onchange=()=>{void send({type:'SET_SIGNAL',roomId:el.dataset.room,signal:el.dataset.signal,status:el.value,note:'operator reported'})}
    })
    root.querySelector<HTMLFormElement>('#conf-plan-form')?.addEventListener('submit',e=>{
      e.preventDefault()
      const plan=draftPlan()
      if(plan)void send({type:'SET_SESSION_PLAN',plan})
    })
    root.querySelector<HTMLFormElement>('#conf-add-cue')?.addEventListener('submit',e=>{
      e.preventDefault()
      const plan=draftPlan()
      if(!plan)return
      const offsetSec=Number(input('conf-cue-time'))
      if(!Number.isInteger(offsetSec))return
      const action=input('conf-cue-action') as 'TAKE_GRAPHIC'|'PLAY_MEDIA'
      const label=input('conf-cue-label').trim()
      const cues=[...plan.cues,{id:`extra-${crypto.randomUUID().slice(0,12)}`,label,offsetSec,action}]
        .sort((a,b)=>a.offsetSec-b.offsetSec)
      void send({type:'SET_SESSION_PLAN',plan:{...plan,cues}})
    })
    root.querySelectorAll<HTMLButtonElement>('[data-remove-cue]').forEach(button=>button.onclick=()=>{
      const plan=draftPlan()
      if(!plan||!confirm('Remove this cue from the saved production plan?'))return
      const cues=plan.cues.filter(c=>c.id!==button.dataset.removeCue)
      void send({type:'SET_SESSION_PLAN',plan:{...plan,cues}})
    })
    root.querySelector<HTMLButtonElement>('[data-run-rehearsal]')?.addEventListener('click',()=>{
      if(!state)return
      const scenario=input('plan-scenario') as RehearsalScenario
      rehearsalReport=rehearse(state,selectedId,scenario)
      render()
    })
    root.querySelector<HTMLButtonElement>('[data-export-rehearsal]')?.addEventListener('click',()=>{
      if(!rehearsalReport||rehearsalReport.sessionId!==selectedId)return
      const blob=new Blob([JSON.stringify(rehearsalReport,null,2)+'\n'],{type:'application/json'})
      const url=URL.createObjectURL(blob)
      const link=document.createElement('a')
      link.href=url;link.download=`dc27-${selectedId}-${rehearsalReport.scenario}-rehearsal.json`
      document.body.appendChild(link);link.click();link.remove()
      window.setTimeout(()=>URL.revokeObjectURL(url),500)
    })
    root.querySelector<HTMLFormElement>('#conf-add-session')?.addEventListener('submit',e=>{
      e.preventDefault()
      const session:ConferenceSession={id:`manual-${crypto.randomUUID().slice(0,12)}`,title:input('conf-new-title').trim(),
        speaker:input('conf-new-speaker').trim(),date:input('conf-new-date'),
        roomId:input('conf-new-room'),start:input('conf-new-start'),end:input('conf-new-end'),status:'scheduled'}
      selectedId=session.id;selectedDay=session.date
      void send({type:'UPSERT_SESSION',session})
    })
  }
  async function load(){
    try{
      const response=await fetch(api(slug,'state'),{cache:'no-store'})
      if(!response.ok)throw Error(`State unavailable (${response.status})`)
      const payload=await response.json() as {state:ConferenceState}
      state=payload.state
      render()
      openSocket()
    }catch(e){
      lastError=e instanceof Error?e.message:'Authority unavailable'
      root.innerHTML=`<main class="loading" role="alert">Conference authority unavailable. Start the Fire Producer Worker and refresh. ${esc(lastError)}</main>`
    }
  }
  function openSocket(){
    socket?.close()
    const protocol=location.protocol==='https:'?'wss:':'ws:'
    const ws=new WebSocket(`${protocol}//${location.host}${api(slug,'ws')}`)
    socket=ws
    ws.onopen=()=>{connected=true;reconnectDelay=1200;render()}
    ws.onmessage=(e)=>{
      try{const payload=JSON.parse(e.data) as {state?:ConferenceState}
        if(payload.state){state=payload.state;render()}
      }catch{ /* ignore non-state messages */ }
    }
    ws.onclose=()=>{if(socket!==ws)return;connected=false;render()
      const delay=reconnectDelay;reconnectDelay=Math.min(15000,reconnectDelay*2)
      window.setTimeout(()=>{if(socket===ws)openSocket()},delay)
    }
    ws.onerror=()=>ws.close()
  }
  void load()
}
