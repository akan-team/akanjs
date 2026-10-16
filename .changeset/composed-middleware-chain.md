---
"akanjs": patch
---

An endpoint's middleware chain is composed once — per global middleware set, env and endpoint — and reused by every call, instead of being rebuilt from the middleware map and re-resolving each handler on every call; a middleware whose setup rejects still fails only that call and is set up again on the next. A call no longer passes through the cache, idempotency or rate-limit step when the endpoint declares no cache, is not an HTTP mutation, or has no budget. Measured in process, a bare query went from 2.3 to 2.0 µs per call.
