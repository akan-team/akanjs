---
"akanjs": minor
---

`router.backTo(href)` steps back once when it is called again before its first back has landed, and steps back to the page under at a fragment (`/board#done`) when `href` names none (`/board`).

A double tap on a close button called `backTo` twice while the first back was still playing its leave or waiting for the browser's `popstate`, so the second call read the same entry and stepped back again, past `href`: in a CSR or native stack the visitor left the page. A second call now does nothing until the first back lands, and a back that moved nothing (a shell's back that cancelled a page still preparing, or a refused one) lets the next call go. The address recorded under an entry also kept its hash, so `backTo("/board")` over an entry pushed from `/board#done` rewrote the entry instead of stepping back, so the page stood twice in history. A fragment `href` names is still matched as written.

Upgrade: nothing to change. `CsrLocation` gains `leaving(moving)` and `isLeaving()`, and the router hands a shell's `back` result on, so a `RouterInstance.back` that returns a promise holds off a second `backTo` until it settles; `router.navigation()` still resolves as before.
