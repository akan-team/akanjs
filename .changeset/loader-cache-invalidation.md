---
"akanjs": minor
---

A model loader that keeps its keys (`{ cache: true }` or a number of milliseconds) now forgets the keys of a document when it is written through the model. A create, a `save()`, an update or a remove drops every key the document answers now or answered before the write, once the write commits, so the next load reads the new row and a write that rolls back drops nothing. A kept key used to be answered in its old shape until it expired, or forever under `cache: true`. A `byQuery` loader's cache is keyed by the values of its query fields rather than by the query object, so an equal query is answered from it.

`cache: true` keeps the 10,000 keys used most recently instead of every key the process ever loaded.

**Upgrading.** Nothing to change. A query write such as `updateMany` runs no document hook and so drops no key, and another instance keeps its own keys until they expire, as before. `DataLoader` takes a `maxCacheSize` option for the bound.
