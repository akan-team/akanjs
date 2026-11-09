---
"akanjs": patch
---

Each caller of `get<Model>`, `load<Model>`, `load<Model>Many` or a declared loader now gets its own document, while the loads made together still cost one query. Before, two concurrent requests that loaded the same id in the same tick were handed one document object. An edit one request made and never saved, for instance because a check refused it, was visible to the other, and was written by the other's unrelated `save()`. The same was true of a key repeated in one `load<Model>Many`, of two keys of a `byArrayField` loader that match the same document, and of every caller a loader with `cache` answered from memory.

A caller after the first gets the document as it was read, built from the same stored row: it has the same prototype and methods, a save writes only the fields it changed, and a document read without its secret fields still keeps them on save. A loader with `cache` still answers from memory without a query, but every answer is the document as it was loaded, not as an earlier caller left it. `DataLoader` takes a `copy` option that gives a caller its own value whenever another caller already holds that value.
