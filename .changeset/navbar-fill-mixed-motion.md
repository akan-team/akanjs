---
"akanjs": patch
---

A crossfading navbar keeps its fill while a page whose navbar rides (`navbarMotion: "page"`) moves over it or away from it.

The top layer is clear while the page on screen rides, and only a riding bar drew its own fill, so the bar of a page under it that kept the default `"crossfade"` lost its background for the whole push, swipe back or `bottomUp`, and what scrolled under it showed through. While the page on screen rides, every navbar in the stack now draws its own fill at its own height; a crossfading page on top still fills the layer as before.

Upgrade: nothing to change.
