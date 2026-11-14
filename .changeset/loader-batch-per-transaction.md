---
"akanjs": minor
---

A model loader no longer shares a batch between a transaction and the requests outside it. `get<Model>`, `load<Model>`, `load<Model>Many` and every declared loader batch the loads of one tick into one query, and that query ran for whichever caller asked first: a load inside `this.transaction()` that joined a batch from another request read the committed row instead of its own write, and a load from another request that joined the transaction's batch read rows it had not committed. Each open transaction now gets a batch of its own, run on its own connection, on SQLite and Postgres alike. A load inside a transaction is never answered from a loader's `cache` and what it reads is not kept, since it may be rolled back.

**Upgrading.** Nothing to change. `DatabaseAdaptor` gains an optional `transactionKey()`, which a custom database adaptor implements to get the same separation, and `DataLoader` takes a `scopeFn` option; a `batchScheduleFn` must run its callback in the caller's async context, as `queueMicrotask` and `setImmediate` do.
