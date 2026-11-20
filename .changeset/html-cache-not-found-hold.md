---
"akanjs": patch
---

A page that answered not-found keeps its URL out of the HTML result cache for at most 60 seconds, instead of the route's whole cache TTL.

A not-found render is remembered so the next responses say `X-Akan-Cache: BYPASS` with `X-Akan-Cache-Reason: render-not-found` rather than `MISS`. It was remembered for the route's TTL, so on a route cached for an hour a record requested a moment before it existed left its page rendered for every request for that hour. The page is now tried for the cache again after a minute, or after the route's TTL when that is shorter.

Upgrade: nothing to change.
