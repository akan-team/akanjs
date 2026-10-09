---
"akanjs": patch
---

A not-found raised by a page no longer renders a blank 200. A path value its `.param()` type refuses is checked before any byte is sent, so it answers 404 with the nearest layout's `.notFound()` view. `router.notFound()` from a page or layout body shows that view in place of the route that raised it; the status is 404 wherever the response is still held, which includes crawlers and `ssr: "block"` routes, and 200 once a browser's stream has started. Such a page is never cached.
