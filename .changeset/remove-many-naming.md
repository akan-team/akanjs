---
"akanjs": minor
---

feat(document): query-level `remove`/`update` per filter, and rename `deleteMany` to `removeMany`

The model facade's `deleteMany(query)` and the store's `deleteManyByQuery(query)` never deleted anything: both
stamp `removedAt` in one atomic UPDATE, exactly like `remove(id)` does. The framework has no hard delete for a
model table at all — `DELETE FROM` appears only against the cache, `_akan_meta`, and the search mirror. They are
now `removeMany` and `removeManyByQuery`, so the name matches the write, and `delete` stays free to mean a real
`DELETE` if one is ever added. Rename the call sites; the behaviour is unchanged.

Filters now generate four query-level writes alongside the ten readers, on both the service and the model:

```ts
await this.removeInCategory("news");                              // every match
await this.removeOneInCategory("news");                           // the newest match (createdAt desc)
await this.updateInCategory("news").set({ status: "archived" });  // every match
await this.updateOneInCategory("news").set({ status: "archived" });
```

**The update pair is a chain.** The patch cannot trail the filter args — those may be optional, and no tuple type
puts a required element after an optional one — and leading it reads backwards. So it lands on a terminal `.set()`,
which mirrors the `UPDATE … SET …` the call compiles to. Building the chain runs no query; only `.set()` does.

These are query-level writes: one atomic UPDATE that **fires no hooks**, so no `_pre`/`_postRemove` and no cascade
run. Reach for them on a model that carries no removal side effect, and remove documents one at a time otherwise.
`removeOne`/`updateOne` hit the **newest** match: their subquery is ordered `createdAt` descending, the caller cannot
change that, and the result carries counts rather than an id. They are for "there is at most one of these", not for
claiming the next item off a queue.

Because filter methods are assigned after CRUD, a filter keyed after its own model would have silently replaced
the single-document `remove<Model>`/`update<Model>` with a hookless query-level one. That now throws while the
service is being resolved instead. Services also gained `__removeMany`, `__removeOne`, `__updateMany`, and
`__updateOne`, and the store gained `removeOneByQuery`.

On the **model facade**, `countDocuments(query)` is now `count(query)`; the old name still works and is marked
`@deprecated`. Its writes keep `Many`/`One` spelled out — `updateOne` / `updateMany` / `removeOne` / `removeMany` —
rather than following the short `find`/`findOne` pair: a bare `Model.update`/`Model.remove` would read like the
document-path `update(id)` and `doc.remove()` while quietly hitting every match.
