---
"akanjs": patch
"@akanjs/cli": patch
---

The browser's RSC client now throws coded errors instead of bare `Error`s, so a caller can branch on `error.code`. A route the server has no page for is `routeNotFound` (404), as a missing WebSocket route already is. A response with no RSC payload is `rscFetchFailed` (502). A patch missing its parts, or a full fallback that answers with a patch, is `invalidRscResponse`, the code `rscClientFetch` already throws for the latter. The redirect marker, which only a log line receives, is `rscRedirectStarted`. Each error keeps its `name` and its message, except the fallback's message, which is now `[rscClient] fallback is a patch`. The error-code reference lists the new codes.
