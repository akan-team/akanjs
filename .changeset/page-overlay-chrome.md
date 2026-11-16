---
"akanjs": minor
---

`overlay: true` (or `"top"` / `"bottom"`) in a route's `.config()` lays the page under that side's safe area and inset instead of below them, so a translucent bar (a frosted tab bar, a glass header) has the page's content scrolling beneath it. On an overlaid side the page's padding is 0, `--akan-overlay-top` / `--akan-overlay-bottom` carry the chrome's height for the page's scrollers to pad by, the top inset's container stops painting the background, and the safe area strip is transparent and lets touches through unless the route sets its color. Until now every bar sat over a reserved band of plain background, so a backdrop blur had nothing to show.

The key defaults to off, so existing pages are unchanged. The api report lists the new `PageOverlayConfig` type and one new optional property on `PageConfig` and on `CsrState`; no upgrade step is needed.
