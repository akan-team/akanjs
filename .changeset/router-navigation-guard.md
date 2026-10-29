---
"akanjs": patch
---

`router.addNavigationGuard(guard)` keeps a page with unsaved work. The guard receives `{ kind, from, to }` before every in-app move: `push`, `replace`, `back`, a `Link`, the browser's back and forward, a native back button or swipe, and the in-page agent's `navigate` and `goBack`. It returns the call that removes it. A guard that answers `false`, throws or rejects keeps the page, and `router.navigation()` then rejects with `NavigationRefused`. A refused browser back or forward is undone with `history.go` before the shell redraws; an async guard that later allows it replays the move. Guards answer one at a time, and a move started while one is deciding is refused. Redirects, `notFound()`, `setLang` and moves off the origin are not asked. Every history entry the RSC client and the CSR shell write now carries its index, so a popstate knows how far it moved.
