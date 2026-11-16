---
"akanjs": patch
---

`router.backOrFallback()` and `Link.Back` with a `fallback` close a browser tab the app itself opened instead of replacing to the fallback, when there is nothing to go back to. The tab counts as opened by the app when it holds one history entry and has an opener or a same-origin referrer, so a `window.open(href, "_blank", "noopener")` or `target="_blank"` link qualifies. A tab the person opened (a bookmark, a typed URL), one another site opened, and an iOS, Android or desktop shell keep going to the fallback, as does a tab the browser refuses to close.
