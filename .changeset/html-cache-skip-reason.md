---
"akanjs": patch
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

fix(akanjs): a page the HTML cache does not keep answers `BYPASS` with the reason, not `MISS` every time

A page whose render reads the request (`headers()`, `cookies()`, or a `fetch.*` call, which carries the visitor's session and address) is rendered for each request and never stored. Its responses said `X-Akan-Cache: MISS` each time, as if the next one would be a hit, and the reason reached only the verbose log as `reason=store-skip`.

- Such a page now answers `MISS` once and then `X-Akan-Cache: BYPASS` with `X-Akan-Cache-Reason: dynamic-request-api`, until the route cache TTL passes or the cache is invalidated. A page that answered not-found or a redirect after its stream began says `render-not-found`, `render-redirect` or `late-redirect` the same way. A cancelled or failed render is not held, so one closed tab cannot switch the cache off for a URL.
- `akan_route_cache_lookups_total` counts those four reasons under `outcome="bypass"`, where they were not counted at all, and `httpHtmlCacheEntries` no longer counts a page held out for `script-hashes`.
- The verbose log line names the reason (`reason=dynamic-request-api`).
- The caching page of the docs and the `akan-page` skill say that a render-time `fetch.*` makes the page dynamic and that `{ forwardVisitor: false }`, for an endpoint that answers every caller alike, lets the server keep it. Run `akan agent install` in a workspace to pick up the skill.
