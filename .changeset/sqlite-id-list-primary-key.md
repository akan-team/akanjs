---
"akanjs": patch
---

On SQLite a read, count or write by a list of ids (`q.oneOf` on `id`, which is how a batched load by id reads) goes through the primary key. A model with an index that leads with `removedAt` had a list of five or more ids read every live row instead: at 20,000 rows a load of five ids took about 6 ms and now takes about 0.03 ms.
