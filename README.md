# Fire Producer

**Live production for every field, stage, and venue.**

Fire Producer is an event-sourced live production and interactive streaming system for Fire TV and the web. A scorer or producer controls one authoritative game state; viewers, scorebugs, captions, alternate displays, and future Alexa experiences project from that same state.

The first vertical slice is football.

**Live demo:** https://fire-producer.stokoe.workers.dev/?mode=viewer&game=demo  
**Operator:** https://fire-producer.stokoe.workers.dev/?mode=operator&game=demo

## What works in v0.2

- authoritative per-game `GameDO` on Cloudflare Durable Objects;
- SQLite-backed append-only event journal;
- idempotent operator commands;
- WebSocket fan-out to independent viewer surfaces;
- football score, quarter, clock, down/distance, field position, possession;
- caption/lower-third text;
- live drive history;
- broadcast-grade viewer and producer surfaces from one Vite build;
- HLS program-feed input via `?stream=<m3u8-url>` with native playback or hls.js fallback;
- Fire TV remote-friendly Game Center (`ArrowUp` opens/closes it);
- animated scoring / possession stings and resilient scorebug/caption overlays;
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

Without `?stream=`, the viewer uses a synthetic football program feed for an immediately reproducible demo. Pass an HLS playlist URL as `?stream=https://…m3u8` to bind a real encoder/program feed. The next slice packages the viewer as the Fire TV/Vega submission while preserving the same game-state authority.

## Storage

`GameDO` uses Durable Object SQLite for the live event journal. Neon/Postgres is an optional archive/analytics plane, not the scoreboard lock. See `docs/ARCHITECTURE.md`.

## Lineage

Fire Producer is a clean generalization of live-production patterns proven in [`mcc0nnell/sf26`](https://github.com/mcc0nnell/sf26): event-sourced contest state, idempotent commands, captions, independent outputs, and resilient operator workflows. SF26 remains intact as the donor/proving ground.

## License

Apache-2.0. See `LICENSE`.
