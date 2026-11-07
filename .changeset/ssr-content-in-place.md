---
"akanjs": patch
---

A server-rendered page now shows its content as soon as the HTML arrives. Every layout and page level was wrapped in a Suspense boundary whether or not it declared `.loading()`, so React put even a page whose data was ready into a hidden segment and revealed it with a script it throttles to 300ms after the first paint. A browser test that clicked in that gap failed now and then, and a URL with a fragment (`/pokemon/pikachu#moves`) missed its target. `ssr: "block"` did not fully help: React still showed the `.loading()` fallback in front of a large page it had already rendered.

- **Only a level with `.loading()` gets a boundary.** Every layout and page above a route's first `.loading()`, or the whole route when it declares none, is written in place in the HTML, and the response waits for it. A level with `.loading()` still sends its fallback first and its content when it is ready, as before. A route whose data is slow and that declares no `.loading()` now sends nothing until the data is ready; give the slow level a `.loading()` to keep the fallback first.
- **Real statuses from the page body.** A `router.notFound()` or `router.redirect()` raised after I/O by a body above the first `.loading()` is now a real 404 or 3xx, because the response has not started yet. An error such a body throws after I/O now returns the error page with status 500. Before, the server sent a 200 page with that level empty, and the same error broke the page again when the browser rendered it.
- **`ssr: "block"` writes every boundary in place,** so a blocking page never shows its `.loading()` fallback.
- **Fragments land on their target.** A document opened at a fragment scrolls to the target when React reveals it, if the target was not on the page yet and the visitor has not scrolled. A client navigation to another page's fragment lands on the target instead of the top.
