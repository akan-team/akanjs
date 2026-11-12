---
"akanjs": patch
---

With `AKAN_PUBLIC_RSC_PARTIAL_COMMIT=1`, a partial navigation whose page redirects or fails in a later chunk of its stream than the first row is now fetched again whole when that chunk arrives before the patch is laid, as it already was when the redirect or error came in the first chunk. Before, the patch was laid: the browser stayed on the page that redirected, with the patched part blank, or showed the error in place of the whole page's render. A patch whose stream carried a redirect after it was laid is now asked for again instead of replayed from the navigation cache. A partial navigation now waits one browser task after its first row before it is laid.
