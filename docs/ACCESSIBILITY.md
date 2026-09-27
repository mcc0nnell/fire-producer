# Accessibility architecture

Fire Producer treats accessibility as runtime infrastructure, not a presentation option.

This policy is derived from the project's donor repository, [`mcc0nnell/accessibility-agents`](https://github.com/mcc0nnell/accessibility-agents), specifically its media-accessibility, live-region-controller, keyboard-navigator, contrast-master, ARIA, and data-visualization specialists. CI also runs that repository's web accessibility scanner pinned to a reviewed commit.

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

`.github/workflows/accessibility.yml` runs the Accessibility Agents web scanner against the repository and fails on serious violations. The source is pinned by commit SHA so scanner behavior cannot change silently.

The scanner supplements, but does not replace, keyboard and screen-reader testing of the deployed production surfaces.
