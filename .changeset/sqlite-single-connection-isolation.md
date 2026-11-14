---
"akanjs": minor
---

On SQLite, work outside an open `this.transaction()` no longer sees its uncommitted rows on an in-memory database (`:memory:`, the `TestServer` default) or on a file with a journal mode other than WAL either. A read from another request now returns the last commit on every storage, without waiting for the transaction, so a transaction that awaits a read started outside it, or one that never ends, holds up no read.

- **A file with a rollback journal** gets the second, read-only connection a WAL file already had. The writer runs with `cache_spill` off, so that connection is never locked out, and a transaction's uncommitted pages stay in memory until it commits: one that writes 400 MB grows the process by about that much (456 MB measured) until then.
- **An in-memory database** cannot be opened twice, so before a transaction begins the adaptor copies the last commit, and reads from outside the transaction run on the copy. The copy costs one pass over the database per transaction: 0.02 ms at 0.3 MB (a test-sized database), 0.2 ms at 5 MB, 2.5 ms at 50 MB and 16 ms at 200 MB, measured, plus about half as much again when a read first uses it. It holds one more copy of the database in memory while the transaction is open and is freed when it ends: a 34 MB database grew the process by about 20 MB across 1,500 transactions, with or without reads on the copy. Past a few tens of megabytes, put the database in a file.

A write from another request still waits for the open transaction, as before, and now runs before any transaction that was asked for after it.

**Upgrading.** `SqliteDatabase.getMeta` and `listMeta` now return promises, as they already did on Postgres, so await them. `ConformanceEnv.openSqlDriver` takes a `sqlite` option, set over the file's default pragmas; nothing changes for a caller that does not pass it.
