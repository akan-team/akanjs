---
"akanjs": patch
---

A server-rendered page is smaller, renders faster, and its browser decodes its RSC payload faster. The server used to put every Flight row of the page's payload in its own inline `<script>`. That added up to 4,000 scripts on a 1.1 MB payload, and the HTML of the minimal app's pages carried 150 to 400 of them. Each chunk of the payload the server receives now goes out as one script, with its rows unchanged. A typed-array or `ArrayBuffer` row still goes out as a script of its own, so only that row is base64-encoded. The minimal app's pages now carry 2 scripts each, and their HTML is 6–8% smaller. Measured in Bun with a 1.1 MB payload:

- the server's work from rendering through to the last byte drops by about 16%;
- the server-side decode of the payload drops by about 20%;
- the browser's decode of the page's payload drops by about 25–40%.

The bytes React decodes are unchanged, and so is when a row reaches the page.
