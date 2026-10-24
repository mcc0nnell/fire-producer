// SPDX-License-Identifier: Apache-2.0
import type {ConferenceState} from '../cartridges/conference'
import {assessReadiness,ROUTES,SCENARIOS,type RehearsalReport} from './planning'

const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const labels:{[key:string]:string}={
  audio:'Audio mixer / microphone path',video:'Camera / presentation video path',
  captions:'Caption provider / destination',asl:'Interpreter feed / destination',
  recording:'Recording target',
}
export function plannerMarkup(state:ConferenceState,selectedId:string,report:RehearsalReport|null) {
  const session=state.sessions.find(s=>s.id===selectedId)
  if(!session)return '<section class="conf-bank"><h3>Plan & rehearse</h3><p>Select a session to plan.</p></section>'
  const plan=state.plans.find(p=>p.sessionId===selectedId)
  const ready=assessReadiness(state,selectedId)
  const stale=!!report&&report.sourceRevision!==state.revision
  const readyCount=state.sessions.filter(s=>assessReadiness(state,s.id).verdict==='ready-for-rehearsal').length
  const outcome=report?.passed?'SIMULATED RECOVERY PASSED':'NOT PASSED'
  return `<section class="conf-planning" aria-label="Production planning and rehearsal">
    <div class="conf-console-head"><div><small>SF26-INSPIRED PRODUCTION READINESS</small>
      <h2>Plan & rehearse</h2><p>${readyCount}/${state.sessions.length} session plans meet the rehearsal preflight model (not hardware verified)</p></div>
      <div class="conf-plan-verdict ${ready.verdict==='blocked'?'blocked':'ready'}" role="status">
        ${ready.verdict==='blocked'?`${ready.issues.length} PRE-FLIGHT ISSUES`:'PLANNED READINESS / NOT HARDWARE VERIFIED'}
      </div></div>
    <div class="conf-planning-grid">
      <section class="conf-bank">
        <h3>Session production plan</h3><p>${esc(session.title)}</p>
        <form id="conf-plan-form">
          <label for="plan-operator">Responsible operator</label>
          <input id="plan-operator" maxlength="100" value="${esc(plan?.operator||'')}" placeholder="Assign a person or team" required>
          ${ROUTES.map(key=>`<label for="plan-${key}">${esc(labels[key])}</label>
            <input id="plan-${key}" maxlength="120" value="${esc(plan?.routes[key]||'')}" placeholder="Source → patch → destination" required>`).join('')}
          <label for="plan-fallback">Audience-facing fallback slate</label>
          <input id="plan-fallback" maxlength="240" value="${esc(plan?.fallbackMessage||'')}" required>
          <button type="submit" data-plan-save>SAVE PLAN TO EVENT LOG</button>
        </form>
      </section>
      <section class="conf-bank">
        <h3>Deterministic show cues</h3>
        <p>Planned relative to the session start. Cues are not connected to A/V devices.</p>
        <ol class="conf-cue-plan">${(plan?.cues||[]).map(c=>`<li>
          <strong>${esc(c.action)}</strong> <span>${esc(c.label)}</span>
          <small>T${c.offsetSec>=0?'+':''}${c.offsetSec}s</small>
          ${['TAKE_GRAPHIC','PLAY_MEDIA'].includes(c.action)?`<button type="button" data-remove-cue="${esc(c.id)}">REMOVE CUE</button>`:''}</li>`).join('')}</ol>
        <form id="conf-add-cue"><h3>Add timed cue</h3>
          <label for="conf-cue-label">Cue label</label><input id="conf-cue-label" maxlength="80" required placeholder="Title slide or playback segment">
          <label for="conf-cue-action">Cue type</label><select id="conf-cue-action">
            <option value="TAKE_GRAPHIC">Graphics</option><option value="PLAY_MEDIA">Media</option></select>
          <label for="conf-cue-time">Seconds from session start</label>
          <input id="conf-cue-time" type="number" step="1" min="-600" value="30" required>
          <button type="submit">ADD CUE TO PLAN</button>
        </form>
        <h3>Readiness gates <small>OPERATOR REPORTS, NOT DEVICE PROOFS</small></h3>
        ${ready.issues.length?`<ul class="conf-plan-issues">${ready.issues.slice(0,18).map(issue=>`<li><strong>${esc(issue.code)}</strong> — ${esc(issue.detail)}</li>`).join('')}
          ${ready.issues.length>18?'<li>Additional issues omitted</li>':''}</ul>`:
          '<p>All plan fields and manually reported signals are present. Physical verification and a venue rehearsal are still required.</p>'}
      </section>
      <section class="conf-bank conf-rehearsal">
        <h3>Dry-run rehearsal <small>OFFLINE MODEL · NO LIVE COMMANDS</small></h3>
        <p>Simulate a start-to-finish session or inject a failure. Unready conditions HOLD before taking program live.</p>
        <label for="plan-scenario">Failure scenario</label>
        <select id="plan-scenario">${SCENARIOS.map(s=>`<option value="${s}">${esc(s.replace(/-/g,' '))}</option>`).join('')}</select>
        <div class="conf-buttons"><button data-run-rehearsal>RUN DRY RUN</button>
          <button data-export-rehearsal ${!report?'disabled':''}>EXPORT EVIDENCE JSON</button></div>
        ${report?`<div class="conf-report"><strong>${esc(outcome)} · ${esc(report.outcome.toUpperCase())}</strong>
          ${stale?'<p class="conf-stale">STALE: production state changed after this rehearsal.</p>':''}
          <p>State revision ${report.sourceRevision} · ${esc(report.scenario)} · Zero physical effects</p>
          ${report.postFaultReadiness?`<p>Injected fault evidence: ${report.postFaultReadiness.issues.map(x=>esc(x.code)).join(', ')}</p>`:''}
          <ol>${report.steps.map(step=>`<li><strong>${esc(step.phase)}</strong> at T${step.seconds>=0?'+':''}${step.seconds}s — ${esc(step.reason)}</li>`).join('')}</ol></div>`:
          '<p>No dry-run evidence has been generated for this session.</p>'}
      </section>
    </div>
  </section>`
}
