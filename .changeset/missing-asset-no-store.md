---
"akanjs": patch
---

A missing file under `/_akan/client/`, `/_akan/styles/`, `/_akan/fonts/` or `/_akan/dict/` now answers its 404 with `Cache-Control: no-store` and the asset security headers.

- **Before:** the 404 named no cache policy. A CDN in front of the app may cache such a 404 (Cloudflare keeps one on a `.js` path for 3 minutes), so during a rolling deploy one replica's 404 for a chunk was served for the replicas that have it.
- **Now:** both the app server and the gateway send `no-store`, so a CDN that honours it asks the origin again. CloudFront may still keep an error response for its error caching minimum TTL (10 seconds by default); lower that on the distribution if it matters.
