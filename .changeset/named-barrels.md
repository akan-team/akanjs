---
"akanjs": patch
---

`akanjs/signal`, `akanjs/client`, `akanjs/server`, `akanjs/constant` and `akanjs/store` now list every export by name instead of re-exporting whole files with `export *`. They export exactly the names they did before. A new export in one of those facets' files is no longer exported from `akanjs/<facet>` until its facet's `index.ts` names it. Files under `server/` and `client/native/` stay importable by their own subpath, as before.
