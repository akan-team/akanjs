---
"akanjs": patch
---

`<Link>` on a built SSR page now loads the page it points to before the click, once the pointer has rested on it or it has held keyboard focus for 65 ms; a press before then, a blur, or the pointer leaving cancels it. A touch never prefetches, since a scroll that starts on a link touches it too and a tap reaches its click about 100 ms later. `prefetch="viewport"` also loads the page once the link scrolls into view, behind every link pointed at, and `prefetch={false}` turns this off. `router.prefetch(href, { priority })` does the same from code. A prefetch is skipped under Save-Data or on a 2G connection, for a page the navigation cache holds or the navigation in flight is loading, and outside a production build. At most two run at once, the newest pointed-at link first.

A prefetched page is kept for 15 seconds, so a page shown off a prefetch is never older than that. Taken within 5 seconds it commits as current; older, it commits as a replay, so `Load.Units` and the edit modals refetch their data as they do for a cached page. Only a 2xx or 404 answer is kept: a 429, 408 or 5xx is asked for again on the click. The prefetch cache follows the navigation cache's account rule (a page prefetched for one account is never shown to another) and is cleared by `router.refresh()`. A redirect in a prefetch's answer is followed only when the link is clicked.

A prefetch sends `X-Akan-Rsc-Prefetch: 1` (fetch() may not set `Sec-Purpose`), and the server counts it as `httpRscPrefetchCount`, apart from `httpRscNavigationCount`. Hovering a link renders its page on the server, so a page whose render has a side effect, such as counting a view, should count it from the client or set `prefetch={false}` on its links.
