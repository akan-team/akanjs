---
"akanjs": patch
---

A generated `get<Model>` or a `pick` that finds no live row now answers HTTP and websocket callers 404 `base.error.documentNotFound` instead of a 500 logged as a crash. `NoDocumentError` gains a `toJSON()` that puts only that key on the wire; the server-side message naming the table and the id stays on the server. An MCP call that reads a missing document directly answers as before (`No <model> found for the arguments given.`); one that reaches it through another server's HTTP endpoint now reads it as not found (`The requested item does not exist.`, and `No screen exists for these arguments.` for a page prompt) instead of a server failure.
