# Runtime API

Fire Producer exposes one authority API for every event cartridge.

## Cartridge catalog

```http
GET /api/cartridges
```

Returns the cartridge manifests shipped by this build.

## Event authority

```text
/api/events/{cartridge}/{slug}/manifest
/api/events/{cartridge}/{slug}/state
/api/events/{cartridge}/{slug}/events
/api/events/{cartridge}/{slug}/command
/api/events/{cartridge}/{slug}/ws
```

Each `{cartridge}:{slug}` pair resolves to one Durable Object authority with its own SQLite append-only event log. The authority records its cartridge identity on first use and fails closed if another cartridge or slug is later routed to the same object.

Commands are JSON objects with a cartridge-defined `type`, an `idempotencyKey`, and cartridge-specific fields. Accepted commands receive a monotonically increasing sequence number, are appended before projection, folded into state, and broadcast to WebSocket subscribers.

## Compatibility

Football keeps the original URL surface:

```text
/api/games/{slug}/state
/api/games/{slug}/events
/api/games/{slug}/command
/api/games/{slug}/ws
```

These routes are aliases for `/api/events/football/{slug}/...`; they no longer use a football-specific authority runtime.
