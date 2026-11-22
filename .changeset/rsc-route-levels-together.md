---
"akanjs": patch
---

perf(akanjs): a server render starts every route level once the guards pass, not each after the level above

A level's body began only once the level above had rendered, so a page under three layouts that each awaited a read
paid for each read in turn, and the shell gate held the first byte until the last of them. On a route with three
layouts and a page that each wait 50 ms, the document's first flush and a `/__rsc` navigation's first row went from
214 ms to 52 ms. With a `.loading()` on the page, the first flush went from 158 ms to 52 ms.

- A level's body reads only the params and search it is handed, never the output above it. So the first level inside
  the root layout's `System.Provider` now starts every route level below it at once. Each level still renders inside
  the one above, with the same args. The root layouts still render first, since the provider loads the dictionaries
  and starts the server router as it renders.
- A level that redirects, answers not-found or fails still keeps the levels below off the page. What they returned or
  threw is dropped and not logged.
- A level whose early start failed renders again under the levels above, as it did before, so only its own run reaches
  the log.
- Two levels asking the same query send it once, since a request already shares its queries.
- A partial commit that renders only the page is unchanged. A not-found or error view still renders after its layouts.

**Upgrading.** No code change is needed. A page body now runs even when a layout body above it redirects, and its
output is dropped. Keep access control in `.guard()`, which runs before any body.
