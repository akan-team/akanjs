---
"akanjs": patch
---

The gateway restarts a replica whose unix socket can no longer be opened on Bun 1.4.3 and later, which report the
errno (`ENOENT`, `ECONNREFUSED`, `ENOTSOCK`) where Bun 1.4.0–1.4.2 reported `FailedToOpenSocket`. Before, such a request
answered a raw 500 and the replica stayed unreachable.
