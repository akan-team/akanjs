---
"akanjs": patch
---

On SQLite, work outside an open `this.transaction()` no longer sees it or joins it. A read from another request ran on the one shared connection, inside the transaction, so it returned rows the transaction had not committed, including rows it then rolled back. It now runs on a second, read-only connection to the same WAL file and sees what is committed, as on Postgres, without waiting for the transaction; code inside the transaction still reads its own writes. A write from another request already waited for the open transaction, but when a second transaction began as the first committed, the waiting write could run inside the second one and be rolled back with it after its caller was told it had succeeded. It now runs between the two.

An in-memory database (`:memory:`, the `TestServer` default) and a journal mode other than WAL keep one connection: a second connection cannot read the same in-memory data, and outside WAL it would wait on the writer's lock and stall the event loop. There, writes from other requests still wait for the transaction and are never rolled back with it, but reads still see its uncommitted rows. Code that read another request's uncommitted write now sees the committed state instead.
