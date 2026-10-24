---
"akanjs": patch
---

An index that two declarations build together, such as `{ code: 1 }` and `{ code: -1 }`, or a filter's sort and its reverse, is no longer rebuilt when the declarations trade places. Before, reordering them, or a rolling deploy that mixed two releases listing them in different orders, logged "changed its descriptor and is rebuilt" and built the whole index again at boot.

An index `where` that tests an array field for a member, as `{ tags: q.has("vip") }`, `{ tags: "vip" }` or `q.oneOf` on an array field do, now stops the boot on SQLite and Postgres alike with an error naming the model and the index, as `q.search()` already did. Before, Postgres built the index, while SQLite failed to boot with "subqueries prohibited in partial index WHERE clauses", which named neither.
