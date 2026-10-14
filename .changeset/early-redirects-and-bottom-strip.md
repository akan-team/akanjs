---
"akanjs": patch
"@akanjs/cli": patch
---

A redirect or not-found a layout or page body raises before awaiting any I/O is now a real 3xx / 404 in a streaming response too: the RSC worker holds its first row one task, which is when Flight settles a body that awaited nothing. One raised after I/O still navigates in the page (HTTP 200) unless the route takes `.config({ ssr: "block" })`, and the ssrRule and conventions guidelines now say so instead of "before any HTML is sent". The frame's bottom safe-area strip is painted only under bottom chrome or a route's own `bottomSafeAreaColor`, so a page's `fixed bottom-0` bar paints its own safe-area padding.
