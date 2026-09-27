# Fire Producer

**Live production for every field, stage, and venue.**

Fire Producer is an event-sourced live production and interactive streaming system for Fire TV and the web. A scorer or producer controls one authoritative game state; viewers, scorebugs, captions, alternate displays, and future Alexa experiences project from that same state.

The first vertical slice is football.

## What works in v0.1

- authoritative per-game `GameDO` on Cloudflare Durable Objects;
- SQLite-backed append-only event journal;
- idempotent operator commands;
- WebSocket fan-out to independent viewer surfaces;
- football score, quarter, clock, down/distance, field position, possession;
- caption/lower-third text;
- live drive history;
- viewer and operator modes from one Vite build;
- deterministic reducer tests.

```text
operator -> GameDO -> SQLite event log
               |\
               | +--> viewer / Fire TV
               +----> scorebug / captions / stats
```

## Run

```bash
npm install
npm test
npm run build
npm run worker:dev
```

Then open:

- viewer: `http://localhost:8787/?mode=viewer&game=demo`
- operator: `http://localhost:8787/?mode=operator&game=demo`

The video area is deliberately a program-feed placeholder in v0.1. The next slice binds HLS/encoder input and packages the viewer for Fire TV/Vega while preserving the same game-state authority.

## Storage

`GameDO` uses Durable Object SQLite for the live event journal. Neon/Postgres is an optional archive/analytics plane, not the scoreboard lock. See `docs/ARCHITECTURE.md`.

## Lineage

Fire Producer is a clean generalization of live-production patterns proven in [`mcc0nnell/sf26`](https://github.com/mcc0nnell/sf26): event-sourced contest state, idempotent commands, captions, independent outputs, and resilient operator workflows. SF26 remains intact as the donor/proving ground.

## License

Apache-2.0. See `LICENSE`.
