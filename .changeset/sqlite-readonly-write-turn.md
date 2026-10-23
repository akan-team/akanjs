---
"akanjs": patch
---

On SQLite, a statement waits behind another request's open transaction only when SQLite says it writes: Akan.js now asks the prepared statement (`readonly` and `reader`, new in Bun 1.4.4) rather than matching a leading `SELECT`. A read spelled `WITH … SELECT`, `VALUES`, a `PRAGMA` that reports a value, or a `SELECT` behind a comment no longer waits for that transaction to commit.
