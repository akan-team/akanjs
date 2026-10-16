---
"akanjs": patch
---

The gateway restarts a replica whose unix socket can no longer be opened on Bun 1.4.3 as well, which reports the
errno (`ENOENT`, `ECONNREFUSED`, `ENOTSOCK`) where older Bun reported `FailedToOpenSocket`. Before, such a request
answered a raw 500 and the replica stayed unreachable.
