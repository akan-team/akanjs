---
"akanjs": patch
---

fix: the server compresses only whole, modest bodies

`compressResponse` buffered and brotli- or gzip-compressed any body of a compressible type on the event loop, whatever
its size, and answered a `Range` request with the whole body compressed. It now leaves alone a request with a `Range`,
an answer that is partial (`206`, `Content-Range`) or not a success, and one whose `Content-Length` is over 4 MiB
(compressing blocks the loop about 6 ms per MiB with brotli, 12 with gzip). The gateway keeps an upstream's
`Content-Length` unless it had to drop the upstream's encoding, so the limit holds behind it too.
