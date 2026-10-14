---
"akanjs": patch
---

A page no longer inherits a `<link rel="canonical">` or a `<meta property="og:url">` from any layout: each names one URL, so only the page's own `.head()` sets them. Upgrade note: a page that relied on a layout's canonical or `og:url` now renders none; declare them in the page's own `.head()`.
