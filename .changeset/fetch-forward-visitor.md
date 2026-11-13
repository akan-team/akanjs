---
"akanjs": minor
---

A call a page makes while it renders on the server can leave the page in the route result cache.

A `fetch.*` call made during a server render forwards the visitor's session and address, so it reads the page request's headers and cookies. That marks the render dynamic, and the HTML and RSC result caches never store it, even for an anonymous visitor. A page whose only server data is an answer that is the same for everyone was therefore rendered on every request.

`{ forwardVisitor: false }` in a call's options sends it without the visitor's session or address, so it answers as it would to a stranger and the render can stay cacheable: `fetch.featureFlags({ forwardVisitor: false })`. Another call in the same render that forwards the visitor still keeps the page out of the cache. An explicit `token` and the `jwt` and `clientIp` a cloned client was given are still sent, and a call made in a browser, or aimed at another origin, is unchanged.

Use it only for an endpoint that answers every caller alike, such as a `Public` query that takes no `.with()` argument, and give that endpoint `rateLimit: false` (or exempt it in `option.setRateLimit`) rather than an address budget. Every such call reaches the server from the render's own loopback address, so every visitor's render then shares one budget under that address. Anyone can force a render: a signed-in request or any cookie other than `theme` bypasses the cache, and a new query parameter misses it. Under an address budget, one client forcing renders can spend it, so the call answers 429 for everyone, and the page's fallback for that failure is cached and served to every visitor until the entry expires.

**Upgrading.** Nothing changes unless a call passes `forwardVisitor: false`.
