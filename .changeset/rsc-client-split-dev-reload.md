---
"akanjs": patch
---

In development, an edit to any framework module that the browser's RSC client runs now fully reloads the open tab. That is `rscClient.tsx` and the `server/` modules it loads, such as `rscClientCache.ts`, `rscClientPatch.ts`, `rscClientFetch.ts`, `rscNavigationState.ts` and `rscPrefetchCache.ts`. Only `rscClient.tsx` did before, so an edit to one of the others refreshed the page in place and the tab kept running the old client code.

The RSC client's caches move from `rscClient.tsx` into `rscClientCache.ts`, and its patch commit into `rscClientPatch.ts`, with no change in behaviour.
