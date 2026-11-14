---
"akanjs": minor
---

Concurrent misses of one `cache` endpoint key now share a single run inside a process, so a burst of callers right after an invalidation no longer runs the endpoint once each. A failed run is not cached and rejects every caller waiting on it.

**Upgrading.** No upgrade step. `EndpointCacheKeys` gains `epoch(endpoint)`, and `EndpointCacheKeys.invalidate` marks runs of that endpoint already in flight as stale: a caller arriving after it starts its own run, and the older run no longer writes its answer to the cache.
