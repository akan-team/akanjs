---
"akanjs": patch
---

Switching the theme in the app now writes new `<meta name="theme-color">` tags instead of changing the `content` of the ones on the page, so iOS repaints the status bar behind a home-screen app (and Safari's toolbar) right away rather than on the next load. Tags the document rendered itself are switched off with `media="not all"` and left in place; tags the client wrote are replaced, and the same colors write nothing.
