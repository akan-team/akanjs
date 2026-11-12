---
"akanjs": patch
---

With `AKAN_PUBLIC_RSC_PARTIAL_COMMIT=1`, a partial navigation whose page redirects or fails in a later chunk of its stream than the first row no longer leaves the patch on screen. Before, the patch was laid and kept: the browser stayed on the page that redirected with the patched part blank, or kept the patch with the error in it. Now a redirect or error that arrives before the patch is laid fetches the page whole instead, and one that arrives after it reloads the whole page in place, which follows the redirect or shows the page's error; once a later navigation has left the page, nothing is done. A patch whose stream carried a redirect is no longer replayed from the navigation cache, and a partial navigation waits one browser task after its first row before it is laid.
