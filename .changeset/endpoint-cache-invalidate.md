---
"akanjs": minor
---

A write can drop an endpoint's `{ cache }` answers before their TTL. Plug `EndpointCacheControl` into the service and call `invalidate("bannerListInPublic")` for every answer of that endpoint, or `invalidate("bannerInPublic", [category])` for the one call with those arguments. Every instance sees it at once through the cache the entries live in. Entry keys now carry a per-endpoint generation, a random token that the endpoint-wide form replaces in one write. Nothing is scanned, a miss already running cannot write its stale answer back, and a generation the cache evicts starts a fresh token rather than reviving dropped answers. Entries written before the upgrade are simply missed and expire on their TTL.
