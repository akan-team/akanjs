---
"akanjs": patch
---

A web app opened from the home screen (`display-mode: standalone`) no longer rubber-bands its whole document on iOS, also when an inner scroller reaches its end and hands the drag to the document: `html` and `body` get `overscroll-behavior-y: none` there, in `@layer base`. A page in a browser tab keeps the browser's behavior. An app overrides either way from its own CSS or with an `overscroll-*` utility on `html` / `body`.
