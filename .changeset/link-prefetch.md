---
"akanjs": patch
---

`<Link>` on a built SSR page now loads the page it points to before the click: after the pointer rests on it for 65 ms, or at once when it is touched or focused. `prefetch="viewport"` also loads it once it scrolls into view, and `prefetch={false}` turns this off. `router.prefetch(href)` does the same from code. A prefetch is skipped under Save-Data or on a 2G connection, for a page the navigation cache already holds, and outside a production build. At most two run at once, and a prefetched page is kept for 30 seconds. The prefetch cache follows the navigation cache's account rule: a page prefetched for one account is never shown to another, and the cache is cleared by `router.refresh()`. A prefetched page commits as a replay, so `Load.Units` and the edit modals refetch their data as they do for a cached page. A redirect in a prefetch's answer is followed only when the link is clicked.
