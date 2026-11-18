---
"akanjs": patch
---

fix(akanjs): a CSR page's async layouts and page start their renders together, and a pushed page slides in at once

A CSR layer mounted the layer under it only once its own async render had settled, so a page under three async
layouts made four server round trips in a row before it drew. A stack push waited up to 300ms for that, then slid in
with its loading fallbacks all the same: a native app's channel screen paused 0.2–0.5 s before it moved.

- A render reads only the params and search it is handed, never the output of the layer above, so a layer that mounts
  now starts the async renders under it at once, and each layer takes its run as it mounts. A page draws after one
  round trip, and the same query asked by two levels (`viewOrg` in a layout and its page) is sent once, since the
  client already shares a query still in flight.
- A run started ahead still waits for the route's guards, so nothing under a refused guard renders. One that failed,
  was refused or redirected before its layer mounted is not taken: the layer renders again on its own, and only a
  failure a layer shows is logged.
- A sliding page (`transition: "stack"` and the other moving transitions) no longer waits to be drawn: it slides in
  as soon as its frame is ready, showing its `.loading()` fallback until its content lands. A page switched in place
  (a tab, `transition: "none"`) still waits up to 300ms out of sight, as before.

**Upgrading.** No code change is needed. A pushed page with no `.loading()` slides in blank until its content lands;
give a slow page a `.loading()` skeleton.
