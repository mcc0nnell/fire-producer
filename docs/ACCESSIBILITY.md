# Accessibility architecture

Fire Producer treats accessibility as runtime infrastructure, not a presentation option.

This policy is derived from the project's donor repository, [`mcc0nnell/accessibility-agents`](https://github.com/mcc0nnell/accessibility-agents), specifically its media-accessibility, live-region-controller, keyboard-navigator, contrast-master, ARIA, and data-visualization specialists. CI vendors that repository's web accessibility scanner from a reviewed commit, with the donor SHA and MIT license recorded under `third_party/accessibility-agents/`.

## Runtime rules

- **Live captions are independent program state.** The Captions cartridge can remain mounted across sport, news, weather, conference, and emergency productions.
- **Visual partial captions do not spam assistive technology.** Partials update the visible caption surface immediately; only final committed cues enter the persistent polite announcement channel and transcript history.
- **Critical alerts use a separate assertive channel.** Weather/emergency alerts may interrupt; routine connection, breaking-news, and caption updates use polite status announcements.
- **Live regions exist before updates.** Persistent status and alert regions are present in `index.html`; dynamic renderers update their text rather than creating a new region at announcement time.
- **Keyboard access is baseline.** Every rendered production has a skip link target and visible focus treatment; native controls are preferred over custom roles.
- **Media controls remain operable.** Real HLS program video uses native browser controls in addition to the independent caption projection.
- **Charts have text equivalents.** ECharts remains a visual analytics layer. Game Center exposes concise text summaries and a recent-events table so chart color/canvas output is never the only representation.
- **User display preferences are respected.** Reduced motion, increased contrast, reduced transparency, and forced-colors modes receive explicit CSS fallbacks.

## CI

`.github/workflows/accessibility.yml` runs the vendored Accessibility Agents web scanner against the repository and fails on serious violations. The scanner was imported from donor commit `161c60c7493ad657f371ad8f91253d33c3b12044`, so behavior cannot change silently when the donor repository moves.

The scanner supplements, but does not replace, keyboard and screen-reader testing of the deployed production surfaces.
