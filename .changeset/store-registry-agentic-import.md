---
"akanjs": patch
---

Store registration imports `attachAgentic` from its own file instead of the agentic barrel, so every route's client bundle loads one chunk fewer (about 0.4–0.6KB brotli).
