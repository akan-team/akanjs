---
"akanjs": minor
---

A write can drop an endpoint's `{ cache }` answers before their TTL. Plug `EndpointCacheControl` into the service and call `invalidate("bannerListInPublic")` for every answer of that endpoint, or `invalidate("bannerInPublic", [category])` for the one call with those arguments. Every instance sees it at once through the cache the entries live in. Entry keys now carry a per-endpoint generation, a random token that the endpoint-wide form replaces in one write. Nothing is scanned, a miss already running cannot write its stale answer back, and a generation that expires or is evicted starts a fresh token rather than reviving dropped answers. The generation expires after a day, so no entry is written for longer. A slice caches its insight beside its list, so invalidate both. The one-call form deletes one key: pass every declared argument (`null` for an omitted search argument), use the endpoint-wide form for a slice list, and note that a miss for those arguments already running can still write that entry back.

Upgrade note: a `{ cache }` TTL above one day is capped at one day, and entries written before the upgrade are missed and expire on their TTL.
