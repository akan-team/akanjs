---
"akanjs": patch
---

`/openapi.json` builds its document once per process, on the first request, instead of serializing the registry and the dictionary on every request.
