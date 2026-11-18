---
"akanjs": minor
---

A page may declare `navbarMotion: "page"` in `.config()` (on a layout, for every page under it) so that, in the native app, its navbar moves with the page instead of staying in place while two pages' bars crossfade.

- On a push or a swipe back, each bar slides with its page; the bar of the page underneath drifts and dims with that page, and is cut where the incoming page covers it, so a bar with no fill of its own does not show through.
- A page sliding up (`bottomUp`) carries its bar up with it.
- Between a page with a navbar and one without, the bar no longer folds up to nothing: the top layer keeps the taller bar's height while they move, each page's bar keeps its own height and fill, and the layer itself lets a tap through outside the bar on screen.

`"crossfade"`, the default, is today's UIKit-style motion. `fade` and `scaleOut` transitions already fade the bar with its page and only stop folding its height. The web frame does not change. No upgrade step is needed: a page that declares nothing moves as before.
