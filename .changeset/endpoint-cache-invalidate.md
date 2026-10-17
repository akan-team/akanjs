---
"akanjs": minor
---

A write can drop an endpoint's `{ cache }` answers before their TTL. Plug `EndpointCacheControl` into the service and call `invalidate("bannerListInPublic")` for every answer of that endpoint, or `invalidate("bannerInPublic", [category])` for the one call with those arguments. Every instance sees it at once through the cache the entries live in. Entry keys now carry a per-endpoint generation that the endpoint-wide form bumps in one `incr`, so nothing is scanned and a miss already running cannot write its stale answer back. Entries written before the upgrade are simply missed and expire on their TTL.
