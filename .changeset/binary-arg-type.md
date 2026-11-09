---
"akanjs": patch
---

A `Binary` argument reaches `exec` typed as `Uint8Array<ArrayBuffer>`, so it can go straight to a service or a `fetch` body. Before, it was a copy of `Uint8Array` with every method stripped. A `Binary` return still takes any `Uint8Array`.
