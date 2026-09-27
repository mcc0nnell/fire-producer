# Fire Producer

**Live production for every field, stage, and venue.**

Fire Producer is an independent event-sourced live production and interactive streaming system. A producer controls authoritative event state; televisions, browsers, scorebugs, captions, alternate displays, archives, and analytical surfaces project from that same state.

The first live vertical slice is football. The runtime is growing into a cartridge-based production system for sports, news, weather, conferences, public events, and other live programming.

**Live demo:** https://fire-producer.stokoe.workers.dev/?mode=viewer&game=demo  
**Operator:** https://fire-producer.stokoe.workers.dev/?mode=operator&game=demo

**News:** https://fire-producer.stokoe.workers.dev/?cartridge=news&event=evening&mode=viewer  
**News producer:** https://fire-producer.stokoe.workers.dev/?cartridge=news&event=evening&mode=operator  
**Weather:** https://fire-producer.stokoe.workers.dev/?cartridge=weather&event=baltimore&mode=viewer  
**Weather producer:** https://fire-producer.stokoe.workers.dev/?cartridge=weather&event=baltimore&mode=operator  
**Composite program:** https://fire-producer.stokoe.workers.dev/?composite=friday-night  
**Live captions:** https://fire-producer.stokoe.workers.dev/?cartridge=captions&event=main&mode=viewer  
**Captioner:** https://fire-producer.stokoe.workers.dev/?cartridge=captions&event=main&mode=operator

## What works in v0.9

- authoritative per-production `EventDO` on Cloudflare Durable Objects;
- SQLite-backed append-only event journal;
- idempotent operator commands;
- WebSocket fan-out to independent viewer surfaces;
- football score, quarter, clock, down/distance, field position, possession;
- caption/lower-third text;
- live drive history;
- broadcast-grade viewer and producer surfaces from one Vite build;
- HLS program-feed input via `?stream=<m3u8-url>` with native playback or hls.js fallback;
- Fire TV remote-friendly Game Center (`ArrowUp` opens/closes it);
- lazy-loaded Apache ECharts Drive Map reconstructed from field-position events;
- lazy-loaded ECharts scoring timeline reconstructed from the durable game log;
- animated scoring / possession stings and resilient scorebug/caption overlays;
- deterministic reducer tests;
- an open `EventCartridge` contract;
- executable Football, News, and Weather cartridge cores;
- generic `EventDO` authority keyed by cartridge + production slug;
- one common state/events/command/WebSocket API across cartridges;
- football compatibility routes preserved over the generic runtime;
- live News viewer/producer surface driven by the News cartridge;
- live Weather viewer/producer surface driven by the Weather cartridge;
- composite production surface mounting Football + News + Weather simultaneously;
- deterministic surface priority: weather alert > breaking news > normal program graphics;
- first-class Live Captions cartridge with partial/final cues, speaker labels, pause state, and transcript history;
- composite program mounts captions as a persistent fourth authority;
- provider-neutral caption ingest through the generic command API;
- Accessibility Agents scanner imported into CI and pinned by donor commit;
- persistent polite/assertive live regions, skip navigation, visible focus, labeled controls, and user-preference CSS fallbacks;
- final-only assistive-technology announcements for captions while visual partials remain real-time;
- accessible text summaries/table equivalents for ECharts Game Center analytics;
- native controls on real HLS program video.

```text
operator/provider -> EventDO -> SQLite event log
                       |\
                       | +--> viewers / program outputs
                       +----> graphics / captions / analytics
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

Without `?stream=`, the viewer uses a synthetic football program feed for an immediately reproducible demo. Pass an HLS playlist URL as `?stream=https://…m3u8` to bind a real encoder/program feed. The viewer is device-neutral web software; television-specific packaging can be layered on without changing game-state authority.

## Event cartridges

See [`docs/CARTRIDGES.md`](docs/CARTRIDGES.md), [`docs/API.md`](docs/API.md), [`docs/CAPTIONS.md`](docs/CAPTIONS.md), and [`docs/ACCESSIBILITY.md`](docs/ACCESSIBILITY.md). Football is the first live cartridge; News and Weather now have executable deterministic reducers and tests. The product thesis is in [`docs/PRODUCT.md`](docs/PRODUCT.md).

## Storage

`EventDO` uses Durable Object SQLite for each cartridge production authority. Game Center analytics replay that same journal; charts never become a second source of game truth. Neon/Postgres is an optional archive/analytics plane, not the scoreboard lock. See `docs/ARCHITECTURE.md`.

## Lineage

Fire Producer is a clean generalization of live-production patterns proven in [`mcc0nnell/sf26`](https://github.com/mcc0nnell/sf26): event-sourced contest state, idempotent commands, captions, independent outputs, and resilient operator workflows. SF26 remains intact as the donor/proving ground.

## License

Apache-2.0. See `LICENSE`.
