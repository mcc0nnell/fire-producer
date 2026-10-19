# Fire Producer native runtime (Apache Celix)

This is an incremental, real C11/Celix **authority rewrite**. It is deliberately
not a replacement for the currently deployed Cloudflare Durable Object,
JavaScript frontend, HLS decoder, or platform-specific TV rendering.

## Implemented

- Dynamically registered Celix bundles: authority, football, captions.
- SQLite append-only journal scoped by `(cartridge,slug)`, transactional
  sequence assignment, per-production idempotency, deterministic event replay,
  WAL with `synchronous=FULL` before acknowledgement.
- C service ABI for football scores, clock, field and possession state and for
  caption partial/final, speaker, language, and pause state.
- Native `fire_producerd` process with an owner-only UNIX socket and a
  bounded, duplicate-key-rejecting, newline-delimited JSON control protocol.
- Tests for invalid and duplicate commands, multiple production authorities,
  durable state across complete Celix restarts, live local JSON commands,
  caption pause/final, and socket cleanup. No MessagePack or TalkPipe required.

## Build

Requires CMake >= 3.20, C compiler, Apache Celix development installation,
SQLite3 library and headers. The local control daemon also needs Jansson
library and headers (optional at CMake discovery).

```sh
cmake -S native -B native/build -DCelix_DIR=/path/to/lib/cmake/Celix
cmake --build native/build -j2
ctest --test-dir native/build --output-on-failure
```

For stripped-down Linux hosts where SQLite headers are not installed, set
`-DFP_SQLITE_INCLUDE_DIR=...` and `-DFP_SQLITE_LIBRARY=...` explicitly.

## Local native producer (no network exposure)

From the repository root after a Debug build:

```sh
native/build/fire_producerd /tmp/fire-producer.sock ./local-production.sqlite \
  native/build/fp_football-Debug.zip \
  native/build/fp_captions-Debug.zip \
  native/build/fp_authority-Debug.zip
```

The socket fails closed rather than overwriting an existing filesystem path
and is created with owner-only permissions. One JSON object and a newline
per connection, one JSON reply and a newline. A football command:

```json
{"action":"command","cartridge":"football","slug":"demo","actorId":"director","command":{"type":"SCORE","team":"home","points":7,"idempotencyKey":"score-001"}}
```

A snapshot:

```json
{"action":"state","cartridge":"football","slug":"demo"}
```

The native protocol is **local-only**, intentionally distinct from the public
HTTP/WebSocket API. No direct access from the public internet, and no
automated replication from the Cloudflare authority.

## Not migrated yet

News and Weather reducers, football drives/score-history timeline, bounded
caption transcript history, exact TypeScript-to-C replay parity,
Cloudflare-compatible REST/WebSockets, producer authentication, per-actor
roles, encoder control, HLS/media handling, composite surface arbitration,
archive/export, and device packaging. There is no production cutover.

Do **not** enable two independent writers for the same
`(cartridge,slug)` production.

See `docs/NATIVE_CELIX.md` for the migration plan and the Omarchy/TV
surface analysis. Celix provides production authority while Qt Quick,
Tizen, Fire TV and browser clients remain independent surfaces.
