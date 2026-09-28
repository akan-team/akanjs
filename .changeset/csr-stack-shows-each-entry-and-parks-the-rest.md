---
"akanjs": patch
---

fix(csr): an entry of the same route shows its own content, the first page is cached, and a page nobody sees stops
its effects

- **Same route, new entry, new content.** `/item?id=1` → `/item?id=2` kept showing the first entry: `RenderLayer`
  resolved a route's async render once per mount. It now renders again when an argument the route declares with
  `.param()` / `.search()` changes, layouts included, and keeps the previous result on screen until the new one lands.
- **The page a session opens on is cached** like any page reached later. The history it seeded never put it in
  `cachedLocationMap`, so it unmounted two steps away.
- **Every page container but the current one is `inert` and `aria-hidden`,** frame slot targets included, so Tab focus,
  a screen reader and the agent's `readScreen` no longer reach the page under the current one.
- **A page nobody sees keeps its state but stops its effects.** A cached page, and the page a transition-less switch
  left (tab to tab) once it settled, render inside React's `<Activity mode="hidden">`: DOM and state stay, intervals
  and subscriptions stop, and both come back with the page. The page under an animated transition stays live, since a
  swipe back shows it.
- `idxMap` and `scrollMap` are keyed by the entry's `href` on both sides. `CSR.tsx` read them by pathname, so the page
  under a query-string entry lost its stacking order.
