---
"akanjs": patch
---

A HEAD request to a page, or a request the page redirects after its render has started, no longer logs `[SSR] render failed`. The server stops rendering the document it will not send as an abort, which the renderer logs at debug level. The status and `Location` it answers are unchanged.
