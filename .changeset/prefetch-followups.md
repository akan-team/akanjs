---
"akanjs": patch
---

A page whose render has a side effect, such as counting a view, can now refuse every Link prefetch itself with `.config({ prefetch: false })`; on a `_layout` it covers every page below, and a page there can opt back in with `prefetch: true`. The server runs the route's guards and then answers such a prefetch with an empty 204, rendering nothing, cached or not: a guard's redirect still answers as a redirect, and a refusal as it would for the click, so a prefetch tells a visitor no more than a click about the paths behind a guard. The browser keeps that answer as nothing for the prefetch lifetime, so hovering the link again asks no more, and the click renders the page as usual.

A page prefetched before this tab's own write is no longer shown as current: a mutation, a file upload, a socket message sent or a changed credential drops every prefetched page, as it already ended in-flight query sharing. Only this tab's own writes through `fetch` count: a write from another tab or device, or a server push, leaves a prefetched page as it is for the rest of its 15-second lifetime, and a socket message drops them as it is sent, not once the server has acted on it. A write that changes nothing a page reads, such as a typing notice, passes `{ keepsReads: true }` to keep both its in-flight queries and its prefetched pages.

Link prefetch fixes:

- A link's focus prefetches it after a key press, and until the first pointer press on the page, so focus moved by a screen reader's cursor, switch access or voice control still does; the focus a mouse press, a tap or a pen tap gives a link does not, until the next key press.
- A late redirect from the page on screen, raised while another navigation loads, now runs once that navigation ends keeping the page (a bare 404 refusal, a refresh that finds no page, or a shallow update or a Back between the page's shallow entries that cancels it) instead of being dropped; a navigation that replaces the page still drops it.
- A page the navigation cache holds under another `#fragment` is neither prefetched again nor fetched on the click: the fragment never reaches the server, so the cached payload serves it.
- When more `prefetch="viewport"` links come into view than the queue holds, the first to show are kept, as a page lists its links top down, instead of the last. A link stays watched: one still queued is withdrawn as it leaves the view, and asks again when it comes back.
- `router.prefetch(href)` returns a call that withdraws the request while it still waits.
