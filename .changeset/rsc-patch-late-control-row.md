---
"akanjs": patch
---

With `AKAN_PUBLIC_RSC_PARTIAL_COMMIT=1`, a partial navigation whose page redirects or fails in a later chunk of its stream than the first row no longer leaves the patch on screen. Before, the patch was laid and kept: the browser stayed on the page that redirected with the patched part blank, or kept the patch with the error in it. Now a redirect, error or not-found row that arrives before the patch is laid fetches the page whole instead. One that arrives after it, while the patched page is still on screen and no other page is loading, reloads the whole page in place, which follows the redirect or shows the page's error; such a reload, like any refresh, drops the browser's navigation cache. React's dev-only error rows with an empty digest no longer count as errors for a patch. A patch whose stream carried a redirect is no longer replayed from the navigation cache, and a partial navigation waits one browser task after its first row before it is laid.
