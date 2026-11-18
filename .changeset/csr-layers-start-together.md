---
"akanjs": patch
---

fix(akanjs): a CSR page's async layouts and page start their renders together, not one after another

A CSR layer mounted the layer under it only once its own async render had settled, so a page under three async
layouts made four server round trips in a row before it drew, and a stack push waited for all of them (a native app's
channel screen paused 0.2–0.5 s, then slid in with its loading fallback). A render reads only the params and search
it is handed, never the output of the layer above, so a layer that mounts now starts the async renders under it at
once, and each layer takes its run as it mounts. A push waits one round trip, and the same query asked by two levels
(`viewOrg` in a layout and its page) is sent once, since the client already shares a query still in flight.

- A run started ahead still waits for the route's guards, so nothing under a refused guard renders.
- A run that failed, was refused or redirected before its layer mounted is not taken: the layer renders again on its
  own, and only a failure a layer shows is logged.
