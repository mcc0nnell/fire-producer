# DC27: executable planning and rehearsal

**Status: prototype, not venue-ready.** This is the next slice stacked on
[DC27 conference grid](DC27.md). SF26 supplies the patterns for a canonical
rundown, guarded TAKE, room readiness, operator authority and fallback slates;
no SF26 services are connected to this branch.

## What is persisted

For each conference session the Fire Producer `conference` cartridge now
records a `SessionProductionPlan` in the same append-only `EventDO` event journal:

- an assigned human operator;
- explicit program audio/video, captions, ASL and recording signal paths;
- a human-readable fallback slate;
- an ordered `STANDBY → GO_LIVE → CLEAR` cue plan, timed relative to
  the session start, with optional `TAKE_GRAPHIC` and `PLAY_MEDIA` cues.
  Additional cues can be added or removed in the operator UI; all cue actions
  remain simulation-only until an explicit hardware integration is reviewed.

Every seeded demo session has a clearly **unassigned** plan. A partially filled
plan is valid to save, but *does not pass* readiness. Adding a new session also
creates its initial planning skeleton. A conference write requires the existing
server-configured `PRODUCER_TOKEN` authorization. The relevant command is:

```json
{
  "type": "SET_SESSION_PLAN",
  "idempotencyKey": "unique-planning-event-id",
  "plan": {
    "sessionId": "demo-open",
    "operator": "Sample operator",
    "fallbackMessage": "Please stand by",
    "routes": {
      "audio": "Audio source → mixer → program",
      "video": "Presentation source → switcher → projector",
      "captions": "Caption feed → attendee output",
      "asl": "Interpreter camera → picture-in-picture",
      "recording": "Program output → redundant recorder"
    },
    "cues": [
      {"id":"standby","label":"Standby slate","offsetSec":-300,"action":"STANDBY"},
      {"id":"go","label":"Open program","offsetSec":0,"action":"GO_LIVE"},
      {"id":"clear","label":"Clear stage","offsetSec":3600,"action":"CLEAR"}
    ]
  }
}
```

This illustrative command assumes a 60-minute session and uses *example
labels, not verified hardware*. The reducer rejects unknown sessions,
malformed structures, non-monotonic or invalid cues, oversized fields,
and edits to the plan of a live session. Existing session and signal
commands remain available independently.

## Deterministic readiness

The operator-facing **Plan & rehearse** panel is beneath the existing
conference console. Select a session in the grid, enter the operator and
signal paths, and save the plan. Then attest individual room signal statuses
in the existing **Readiness** controls.

`assessReadiness` checks:

- existing session and structurally valid plan;
- responsible operator and fallback slate;
- assigned audio, video, caption, ASL and recording paths;
- overlapping scheduled sessions in the same room;
- `ok` operator reports for audio, video, captions, ASL, recording and network.

The `tronix` health signal is **not** sufficient to satisfy any equipment
readiness gate. It only shows scheduler reachability.

The result `ready-for-rehearsal` is **not a certification of hardware
readiness**. Every gate is based on *manually supplied claims* rather than an
independently verified device. Physical verification and realistic human
rehearsal remain required for a show.

## Rehearsal scenarios

The in-browser **Run dry run** button operates on the latest read-only
snapshot and never calls the authoritative command API. Reports are
deterministic and include source revision, session, scenario, preflight
issues, synthetic steps and a `physicalEffects:false` marker.

| Scenario | Expected sequence |
| --- | --- |
| Normal | Standby → Go → Clear |
| Speaker late | Standby → Hold (no Go) → Fallback |
| Captions lost | Standby → Go → Hold → Fallback |
| Video lost | Standby → Go → Hold → Fallback |
| Network lost | Standby → Go → Hold → Fallback |
| Preflight incomplete | Hold before program goes live |

The simulation **never automatically resumes** after failure. Recovery
requires explicit human intervention in any eventual hardware adapter.
The `GO` step means a modeled decision only—not a source switch.

**Export evidence JSON** downloads a local report, including readiness and
outcome, for show planning review. Reports are marked stale in the UI when
the observed conference revision changes.

## Verification

```sh
npm ci
npm run check
# Browser: ?cartridge=conference&event=dc27&mode=operator
```

The new tests cover plan validation and event replay, scheduling collisions,
unverified signals, normal run, four injected failures, and hold-before-air.
Additional venue acceptance testing is required once device adapters exist.

## Next hard gates

1. Confirm actual room count, AV signal diagram, equipment, venue VLANs,
   cable runs, projector/IMAG outputs, power and staff contacts.
2. Create and verify a complete production plan for every real session.
3. Introduce authenticated per-actor roles, per-device capabilities and
   confirmed source switching; manual operator overrides should be logged.
4. Build failover tested on disconnected venue networks, with a local
   authority model that never creates two concurrent writers.
5. Monitor captions and interpreter video at the recipient output, not
   merely the production server; rehearse inaccessible-output fallbacks.
6. Run a physical, timed rehearsal with realistic staffing and after-action
   evidence before turning on any agent-driven commands.
