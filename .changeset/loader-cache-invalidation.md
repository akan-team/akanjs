---
"akanjs": minor
---

A model loader that keeps its keys (`{ cache: true }` or a number of milliseconds) now forgets them when the model is written. A create, a `save()`, an update or a remove drops every key the document answers now or answered before the write; a write by query (`updateMany`, `updateOne`, `removeMany`, `bulkWrite`, `upsertById`, a purge or an import) names no document, so it drops every kept key of the model. Either happens once the write commits, ahead of every post hook and `afterCommit` callback, so none of them and no later load is answered from before the write, and a write that rolls back drops nothing. A kept key used to be answered in its old shape until it expired, or forever under `cache: true`. A `byQuery` loader's cache is keyed by the values of its query fields rather than by the query object, so an equal query is answered from it.

`cache: true` keeps the 10,000 keys used most recently instead of every key the process ever loaded.

**Upgrading.** Nothing to change, but check where `cache` is declared: a write by query clears every kept key of its model, so a model that takes `updateOne` or `updateMany` often gets little from a kept loader. Another instance keeps its own keys until they expire, as before. New, all optional: `DataLoader` takes `maxCacheSize`; a document store has `onWrite(listener)`, which hears of each committed write; and `afterCommit(fn, { first: true })` on a database adaptor queues `fn` ahead of the callbacks queued without it. A store listener that throws is logged and fails neither the write nor the other listeners. A custom database adaptor that ignores the option still runs the callback, in the order it was queued.
