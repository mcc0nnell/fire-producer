# Event cartridges

Fire Producer is a live-event operating system. An **event cartridge** supplies the semantics for one kind of production without owning transport, persistence, video, captions, or distribution.

The core runtime owns:

- ordered event authority;
- idempotency;
- append-only persistence;
- WebSocket fan-out;
- program video and captions;
- viewer/operator shells;
- archive/export hooks.

A cartridge owns:

- initial state;
- command validation;
- event reduction;
- domain-specific vocabulary;
- operator controls;
- broadcast projections;
- Game Center/analytics views.

## Current cartridges

### Football

The first live production cartridge. It owns score, quarter, clock, down/distance, field position, possession, drives, and scoring flow. Its Game Center uses lazy-loaded Apache ECharts for drive and scoring visualizations.

### News

Executable core semantics now exist for story selection, lower thirds, breaking-news straps, tickers, and captions. The next step is a news producer/viewer projection and rundown surface.

### Weather

Executable core semantics now exist for location, current conditions, forecast periods, alerts, and captions. Weather data ingestion is deliberately separate from the cartridge reducer so providers can be swapped without changing production semantics.

## Composition

The runtime now demonstrates multiple cartridges contributing to one program through the composite production surface. A football show can mount weather and news capabilities; an emergency alert cartridge can claim a higher-priority surface than a scorebug or ticker.

```text
Fire Producer
  ├── Football
  ├── Weather
  └── News
        ↓
  common live timeline
        ↓
 video · graphics · captions · viewer · archive
```

Cartridges must remain deterministic. External feeds become explicit input events; they do not mutate presentation state behind the event log.

## Surface arbitration

The first composition policy is explicit and deterministic: Weather alert priority 100, News breaking priority 80, Football scorebug priority 50. The composite viewer subscribes to all mounted authorities and projects the highest-priority active override while retaining lower-priority persistent surfaces such as the scorebug, weather bug, lower third, and ticker.
