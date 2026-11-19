---
"akanjs": patch
---

A page whose HTML is over the cache's body cap answers `MISS` once and then `X-Akan-Cache: BYPASS` with `X-Akan-Cache-Reason: body-too-large`, until the route cache TTL passes or the cache is invalidated, instead of `MISS` on every request.

- The cap is `AKAN_HTML_RESULT_CACHE_MAX_BODY_BYTES` (2 MiB by default). A page over it was never stored, yet each response said `MISS` as if the next one would be a hit.
- A page over the cap that also reads the request (`headers()`, `cookies()`, a `fetch.*` call) names that reason, `dynamic-request-api`, since a smaller body would not be stored either.
- `akan_route_cache_lookups_total` counts `body-too-large` under `outcome="bypass"`.

Upgrade: nothing to change. A dashboard that sums `outcome="bypass"` by `reason` gains the `body-too-large` series.
