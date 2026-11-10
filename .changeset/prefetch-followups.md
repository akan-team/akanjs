---
"akanjs": patch
---

A page whose render has a side effect, such as counting a view, can now refuse every Link prefetch itself with `.config({ prefetch: false })`; on a `_layout` it covers every page below, and a page there can opt back in with `prefetch: true`. The server answers such a prefetch with an empty 204 before rendering anything, cached or not; the browser keeps that answer as nothing for the prefetch lifetime, so hovering the link again asks no more, and the click renders the page as usual.

A page prefetched before this tab's own write is no longer shown as current: a mutation, a file upload, a socket message sent or a changed credential drops every prefetched page, as it already ended in-flight query sharing. A server push does not.

Link prefetch fixes:

- A press no longer prefetches through the focus it gives the link, by mouse or by tap; keyboard focus still does.
- A page the navigation cache holds under another `#fragment` is neither prefetched again nor fetched on the click: the fragment never reaches the server, so the cached payload serves it.
- When more `prefetch="viewport"` links come into view than the queue holds, the first to show are kept, as a page lists its links top down, instead of the last. A link stays watched: one still queued is withdrawn as it leaves the view, and asks again when it comes back.
- `router.prefetch(href)` returns a call that withdraws the request while it still waits.
