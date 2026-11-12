---
"akanjs": patch
---

With `AKAN_PUBLIC_RSC_PARTIAL_COMMIT=1`, a page reached by a patch is replayed from the browser's cache under any `#fragment`, as a page in the full-page cache already is: `/docs/x#a` and `/docs/x#b` now share one cached patch, and a link to another fragment of a page the patch cache would replay is not prefetched. A page that refuses prefetching (`.config({ prefetch: false })`) is no longer asked again after each full navigation: its 204 is kept for the prefetch lifetime under any page on screen, for the same account, as it already was with the flag off.
