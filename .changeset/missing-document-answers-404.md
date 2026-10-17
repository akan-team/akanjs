---
"akanjs": patch
---

A generated `get<Model>` or a `pick` that finds no live row now answers HTTP and websocket callers 404 `base.error.documentNotFound` instead of a 500 logged as a crash. `NoDocumentError` gains a `toJSON()` that puts only that key on the wire; the server-side message naming the table and the id stays on the server. MCP answers are unchanged.
