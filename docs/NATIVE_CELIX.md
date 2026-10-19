# Native Celix migration

## Television-package review

Recent Omarchy/Quickshell work provides a useful *surface pattern*: a long-lived
shell with pluggable presentation components, runtime discovery, declarative
widget manifests, and IPC. Its Qt Quick/QML/Hyprland stack is not suitable as
Fire Producer's universal runtime: Samsung Tizen and Fire TV have different
rendering and package formats. Native Celix belongs below all of them.

The television player should be a replaceable subscriber to authoritative
production events, not the owner of the command journal. HDMI sources, HLS,
captions, graphics, operator controls, and archive are separate capabilities.

## Migration sequence and safety gate

1. Native authority: transactional SQLite journal, idempotency, deterministic
   replay, service registry. Initial football and captions bundles implemented
   under `native/`; existing JavaScript authority untouched.
2. Add News/Weather cartridges, complete football drive and score histories,
   bounded caption transcript history, and state/command parity tests against
   the TypeScript implementation.
3. Add an authenticated HTTP/WebSocket adapter for exact existing
   `/api/events/{cartridge}/{slug}` routes, preserving actor and replay behavior.
4. Output adapters: browser/Fire TV/Tizen/Qt, with video handled by native
   decoders or platform SDKs. No Hyprland or Qt dependence inside Celix.
5. Optional isolated local Tronix integration for deadline-sensitive playout
   and alert coordination; never mix the real-time lane with blocking SQLite
   commits or unbounded network work.
6. Production cutover only after golden-fixture replay parity, concurrent
   idempotency tests, fault-injection recovery tests, captions accessibility
   checks, and full failover validation.

**Never enable two simultaneously writable authorities for the same production.**
Cloudflare Durable Objects remain the live authority until cutover.

## Limits of the first native slice

The C services intentionally do not expose an HTTP server or composite viewer
yet. The native caption service currently holds its latest cue rather than the
last 100 committed cues. News, Weather, the Drive Map event history, and
video/graphics projection continue to run only in the existing codebase.

Current Celix smoke checks independent production IDs, invalid values,
idempotent retry, score and clock progression, caption paused/final state,
and restart replay.
