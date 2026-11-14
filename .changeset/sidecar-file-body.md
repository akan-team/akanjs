---
"akanjs": patch
---

A precompressed `.br` or `.gz` asset is now streamed from disk instead of being read whole and copied on every request, which cuts the server CPU per asset request to about a quarter. In production the answer of whether a sidecar exists is remembered per path.
An existing zero-byte `.br` or `.gz` sibling is skipped, because an empty body is not valid brotli or gzip.
