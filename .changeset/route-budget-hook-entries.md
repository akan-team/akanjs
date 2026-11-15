---
"@akanjs/devkit": patch
---

The route JS budget report no longer counts, and the route build no longer emits, chunks for `"use client"` files that export only hooks, such as the `akanjs/store` field tools, which no page loads. Reported route sizes drop by about 21 KB brotli on every route of `apps/akan` and `apps/minimal`.
