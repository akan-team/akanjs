---
"akanjs": minor
---

feat(document): `updateById` / `removeById` on the model facade

The facade could already read one document by id (`findById`, `pickById`) but writing one meant spelling the id back
out as a query: `Model.updateOne({ id }, { … })`. It now carries the id-scoped pair directly.

```ts
await this.Order.updateById(orderId, { status: "archived" });
await this.Order.updateById(orderId, { status: "archived" }, { upsert: true });
await this.Order.removeById(orderId);
```

**These are the query-level writes narrowed to one id, not the document path.** They compile to the same single
atomic UPDATE as `updateOne` / `removeOne` — `removedAt IS NULL` ANDed in, counts returned rather than a document,
and **no hooks**, so no `_pre`/`_postUpdate`, no `_postRemove`, and no cascade. A model whose removal carries a side
effect or a `removeRef` / `removeWith` edge still goes through the service's `remove<Model>(id)`.

`updateById` takes the same trailing options as `updateOne`, so `{ upsert: true }` inserts with that id when nothing
matches. An `undefined` id is rejected by the query compiler rather than widening the write.
