---
"akanjs": patch
"@akanjs/cli": patch
---

A route's `.head()` that throws — a guard refusing a signed-out visitor the record a title reads — now renders without a head and is warned about, instead of failing the request before the layout's `getSelf({ unauthorize })` redirect can answer; a redirect or not-found raised in a head still routes.
