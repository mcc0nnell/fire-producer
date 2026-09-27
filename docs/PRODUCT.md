# Fire Producer product thesis

Fire Producer is an independent, modular live-production system for schools, communities, venues, local media, conferences, sports, public meetings, and events.

It is not tied to a single television platform, cloud, sport, or data provider.

## Product shape

One runtime can produce many kinds of live programming by mounting event cartridges. The same authority/persistence/distribution machinery can run a football game Friday night, morning news Monday, severe-weather coverage Tuesday, a board meeting Wednesday, and graduation in June.

## Deployment planes

- **Local** — SQLite-backed production appliance for venues that cannot trust connectivity.
- **Cloud** — durable live authority and remote viewers/operators.
- **Hybrid** — local continuity plus cloud archive, distribution, and analytics.

Neon/Postgres is a strong archive/catalog/analytics plane. It is not the synchronous lock for live production state.

## Design rule

**DOM runs the broadcast. Rich visualization explains the event.**

Scorebugs, captions, clocks, breaking straps, and other must-not-fail graphics stay lightweight and deterministic. ECharts and other heavier visualization systems load only for analytical or exploratory surfaces.
