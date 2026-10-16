---
"akanjs": patch
---

A call's `traceId` is spelled the first time something reads it (a log line, the canonical request line) instead of on every call, still stamped with the time the call started, and a context-mode trace — the default — no longer wraps each stage of the call in a span it never records. Measured in process, a bare query went from 3.0 to 2.3 µs per call.
