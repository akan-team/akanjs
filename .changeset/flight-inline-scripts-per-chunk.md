---
"akanjs": patch
---

A server-rendered page is smaller, renders faster, and its browser decodes its RSC payload faster. The server used to put every Flight row of the page's payload in its own inline `<script>`. That added up to 4,000 scripts on a 1.1 MB payload, and the HTML of the minimal app's pages on its dev server carried 150 to 400 of them. Each chunk of the payload the server receives now goes out as one script, with its rows unchanged. A typed-array or `ArrayBuffer` row still goes out as a script of its own, so only that row is base64-encoded. On the dev server, the minimal app's pages now carry 1 or 2 scripts each, and their HTML is 5.7–8.1% smaller. Measured in Bun with a 1.1 MB payload:

- the server's work from rendering through to the last byte drops by about 15%;
- in 16 KB chunks, the server-side decode of the payload drops by about 25%, and by less in 1 KB chunks;
- in 16 KB chunks, the browser's decode of the page's payload drops by about 40%, and by less in 1 KB chunks.

The bytes React decodes are unchanged, and so is when a row reaches the page. The first HTML byte leaves as early as before, or earlier.

`AKAN_MAX_PENDING_INLINE_RSC_SCRIPTS` is replaced by `AKAN_MAX_PENDING_INLINE_RSC_BYTES` (default 16 KB). It caps how many bytes of the payload the server reads ahead and holds, unencoded, while the page's HTML is still streaming, though a single chunk larger than the cap is still read and held whole. The old variable counted scripts, and it is no longer read.
