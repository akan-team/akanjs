---
"akanjs": patch
---

`schema.index(fields, { where })` and `createIndex(name).where(...)` build a partial index on SQLite and Postgres (`CREATE INDEX … WHERE …`); the predicate used to be stored and never reach the DDL, so the index covered every row. With `unique`, `where: { removedAt: null }` lets a soft-removed document give its key back. The predicate's values are written into the DDL as literals, since neither dialect binds a parameter there, and a `where` no index predicate can hold (`q.search()`, or a test for a member of an array field such as `{ tags: "vip" }`) fails the boot with an error naming the index and its table, instead of building a whole index. Upgrade note: an index that already declared a `where` is rebuilt once on the next boot, replacing the whole index an earlier version built from it (on a Postgres table that holds rows, built concurrently beside it and swapped in); an index without a `where` keeps its descriptor hash and is not rebuilt.
