---
"akanjs": patch
---

An index that two declarations build together, such as `{ code: 1 }` and `{ code: -1 }`, or a filter's sort and its reverse, is no longer rebuilt when the declarations trade places. Before, reordering them, or a rolling deploy that mixed two releases listing them in different orders, logged "changed its descriptor and is rebuilt" and built the whole index again at boot.

Reordering the fields of a compound index, or of a filter's compound sort, builds the index in the new order and drops the old one; the 3.1.0 release candidates kept the index in the old order and never built the new one. An index an earlier release built under another name is reused only when the database holds it with the declared fields in the declared order, so when 3.0.2 left copies of an index in both orders, the first boot after the upgrade keeps the one in the declared order.

An index made outside akan under the name akan gives a declared index is taken for that index only when the database holds it as exactly that index. Otherwise the boot warns, leaves it alone, and builds the declared index under the name with a suffix. Before, akan took any index of that name for its own, so the declared index was never built, and the 3.1.0 release candidates dropped the hand-made one once nothing declared it.

In the 3.1.0 release candidates, an index `where` that tested an array field for a member, as `{ tags: q.has("vip") }`, `{ tags: "vip" }` or `q.oneOf` on an array field do, was built on Postgres, while SQLite failed to boot with "subqueries prohibited in partial index WHERE clauses", which named neither the index nor its table. Both now stop the boot with an error naming them.

In the `single` database mode, a queued job whose process died or hung past its lease on its last attempt is now marked failed and handed to the worker's `onFailed`, as a stalled job reaches it in the `multiple` and `cluster` modes. Before, it was claimed and run again after every lease, past its `attempts`, and `onFailed` fired only if a later run threw. Upgrade note: a job left at the default single attempt is no longer run again after its process dies; give it `attempts: 2` or more to keep that retry.
