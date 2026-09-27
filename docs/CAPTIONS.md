# Live captions

Live captions are a first-class Fire Producer cartridge. They are not owned by Football, News, Weather, or any other program cartridge.

One caption authority can ride over any production:

```text
captioner / ASR / CART provider
          |
          v
 captions:main EventDO
          |
          |-- partial cue --> program immediately
          |-- final cue ----> transcript history
          `-- WebSocket ----> every mounted viewer
```

## Commands

All commands use the generic EventDO endpoint:

```text
POST /api/events/captions/{slug}/command
```

### Partial cue

```json
{"type":"SET_PARTIAL","speaker":"Announcer","text":"Third and","idempotencyKey":"..."}
```

Partial cues replace the current uncommitted text and are projected immediately. The built-in captioner surface sends them after a short typing debounce.

### Commit cue

```json
{"type":"COMMIT","speaker":"Announcer","text":"Third and six from the 42.","idempotencyKey":"..."}
```

Committed cues become final program text and are appended to transcript history.

### Clear / pause

```json
{"type":"CLEAR","idempotencyKey":"..."}
{"type":"SET_STATUS","status":"paused","idempotencyKey":"..."}
```

## Provider neutrality

The cartridge does not prescribe speech recognition or CART transport. A human captioner, local ASR process, cloud speech service, or standards adapter can all emit the same deterministic commands. External providers therefore never become the source of program state; their output enters Fire Producer as explicit events.
