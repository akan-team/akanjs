---
"akanjs": minor
---

On SQLite, work outside an open `this.transaction()` no longer sees its uncommitted rows on an in-memory database (`:memory:`, the `TestServer` default) or on a file with a journal mode other than WAL either. A file with a rollback journal gets the second, read-only connection a WAL file already had, and the writer keeps its uncommitted pages in memory until the commit, so that connection is never locked out. An in-memory database cannot be opened twice, so there a read from outside the transaction waits for it to finish, as a write already did, and anything that waited runs before a transaction that was asked for after it.

**Upgrading.** On an in-memory database, a transaction that awaits a read started outside it, such as a promise created before `this.transaction()` was called, now waits forever: start the read inside the transaction, or await it first. Reads from other requests also pause while a transaction is open there, so keep it short. `SqliteDatabase.getMeta` and `listMeta` now return promises, as they already did on Postgres, so await them. `ConformanceEnv.openSqlDriver` takes a `sqlite` option, set over the file's default pragmas; nothing changes for a caller that does not pass it.
