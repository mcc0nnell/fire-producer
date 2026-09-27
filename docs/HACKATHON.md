# Amazon Build, Ship, Shape vertical slice

Fire Producer's competition slice is one complete football production path, not a broad sports platform.

## Three-minute demo

1. Fire TV/web viewer is already playing an owned or synthetic live football feed.
2. Producer changes possession, down/distance, clock, caption, and score from the operator surface.
3. The viewer updates immediately from the authoritative `GameDO` state.
4. The viewer opens the current-drive history without leaving video.
5. A brief network interruption demonstrates last-known-good viewing and authoritative replay/reconnect.
6. Alexa+ (next slice) answers one useful live-state question from the same game authority.

## Build boundary

The hackathon-period work is the generalization from SF26's event-production runtime into a reusable football/live-event product plus Fire TV packaging. SF26 remains intact as the donor and production proving ground.

## Do not overbuild

The first submission does not need league management, wagering, rights acquisition, a generalized stats provider, or every sport. One polished football path proves the architecture.
