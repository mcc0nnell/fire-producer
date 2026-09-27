# Fire Producer architecture

Fire Producer separates **live authority** from **durable history and analytics**.

```text
operator / scorer
      |
      v
GameDO (authoritative live state)
      |-- WebSocket --> Fire TV / web viewer / scorebug
      |-- SQLite event log (inside the Durable Object)
      `-- optional export --> Neon/Postgres
```

The database remembers the game. `GameDO` runs the game.

The first vertical slice is football because it makes state transitions visible: score, quarter, clock, down, distance, field position, possession, captions, and drive history. The event model is intentionally small and replayable.

## Persistence profiles

- **Cloud**: Durable Object SQLite is the authoritative event journal for each live game.
- **Local appliance**: a future local adapter can write the same event schema to a standalone SQLite database when venue connectivity is poor.
- **Networked archive**: Neon/Postgres can receive append-only game events for season history, rosters, analytics, discovery, and public APIs. It is not the synchronous scoreboard lock.

## SF26 lineage

The runtime pattern is derived from the production ideas proven in `mcc0nnell/sf26`: one authoritative event-sourced object per live contest, idempotent commands, independent read-only displays, and operator state that survives device swaps and network interruption. Fire Producer generalizes that pattern beyond a conference and College Bowl into live sports and events.
