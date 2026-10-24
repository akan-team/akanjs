---
"akanjs": patch
---

`router.push` and `router.replace` now refuse an absolute URL on another origin, so a `?redirect=` handed to them unchecked can no longer send a visitor off-site. A refused call stays on the page, warns, and rejects `router.navigation()`. `router.redirect` sends such a target to the index path instead, on the server and in the browser. Pass `{ external: true }` to leave on purpose. Paths, same-origin URLs and `//host` (read as a path) are unchanged.
