---
"akanjs": patch
---

A page asks for its stylesheet before its client chunks. The preload tags for the chunks a page's first screen imports are written at the end of `<head>` instead of at its top, so the stylesheet link comes first; the bootstrap module, the dictionary and the import map stay at the top. On a throttled mobile connection (Lighthouse's slow 4G applied in the browser, over HTTP/2) a 56-chunk page first paints about 160 ms sooner (1.83 s to 1.67 s), and a page whose largest element is a small image shows it about 140 ms sooner; a large image still shares the connection with the chunks and arrives when it did. Every chunk still starts loading with the document, so the page hydrates when it did.
