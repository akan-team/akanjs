---
"akanjs": patch
---

The SQLite cache sweeps expired entries through an index on their expiry, a thousand at a time with a pause between, so a large backlog no longer stalls the server for hundreds of milliseconds, and `hkeys` and `hentries` no longer run a sweep on every call. They skip expired fields themselves, so they return the same fields as before. The index is built once, at the first start after upgrading.
