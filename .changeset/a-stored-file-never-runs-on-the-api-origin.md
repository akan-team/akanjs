---
"akanjs": patch
---

fix: a file `getBlob` serves never runs as a page of the API's origin

`libs/util`'s `getBlob` (`/api/localFile/getBlob/*`) sets no Content-Type of its own: Bun types the body by its
stored name and answers a Range with a 206, and the response goes out the way Bun sends a file, neither buffered nor
compressed. Every answer but a PDF's carries `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline';
sandbox` and `X-Content-Type-Options: nosniff`, so an uploaded `.html` or `.svg` opened from its URL runs no script on
the API's origin, which is also the origin of a desktop app's carried server. An `<img>` or `<video>` showing the file
is unaffected; a PDF is left out because a browser's viewer refuses a sandboxed document.
