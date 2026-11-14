---
"akanjs": patch
---

Concurrent misses of one `cache` endpoint key now share a single run in this process, so a burst of callers right after an invalidation no longer runs the endpoint once each. Every caller gets its own copy of the answer, as a cache hit does, a failed run is not cached and rejects every caller waiting on it, and a run older than the endpoint's `timeout` (60 seconds with none) is no longer joined.

A run in flight in this process when an endpoint is invalidated, whole or for given args, is not joined by later callers and does not write its answer to the cache. A run in flight on another instance can still write a stale answer after a per-args invalidation, as before.

**Upgrading.** The first caller of a miss now gets the same copy a cache hit returns, not the object the handler returned. A middleware or resolveField that read a method or an undeclared property of that object worked on a miss and failed on a hit; it now fails on both.
