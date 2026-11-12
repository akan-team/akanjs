---
"akanjs": minor
---

A query a page makes while it renders can leave the page in the route result cache.

A `fetch.*` query made during a server render forwards the visitor's session and address to the server, so it reads the page request's headers and cookies. That marks the render dynamic, and the HTML and RSC result caches never store it, even for an anonymous visitor. A page whose only server data is an answer that is the same for everyone was therefore rendered on every request.

`{ forwardVisitor: false }` in a query's options sends it without the visitor's session or address, so it answers as it would to a stranger and the render stays cacheable: `fetch.featureFlags({ forwardVisitor: false })`. Use it only for an endpoint that answers every caller alike, such as a `Public` query that takes no `.with()` argument. An address-keyed rate limit counts the call under the server's own address. A call made in a browser, or aimed at another origin, is unchanged.
