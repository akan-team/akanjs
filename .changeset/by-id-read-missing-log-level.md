---
"akanjs": minor
---

A generated `<model>` or `light<Model>` read asked for an id that does not exist now logs its 404 at debug, not as an ERROR line. A page guard that checks a document exists, such as `await fetch.memo(memoId)`, used to send every stale link, crawler hit or made-up id to error alerts. The caller still gets the same 404 `base.error.documentNotFound`, and OpenAPI and the MCP catalogue are unchanged.

Only the miss of the document the read was asked for, by its model and the call's id, is quieted. Every other missing document still logs as an error, including one inside that same read:

- a second document an overriding `get<Model>` or a resource guard loads, such as a removed owner;
- a query miss (`pick`, `pickOne`);
- a missing document in a generated `update<Model>` or `remove<Model>`, or in a custom endpoint.

`NoDocumentError` gains an optional `lookup: { refName, id }`, which the by-id reads set (`get<Model>`, a model's `pickById` and the SQL store's by-id reads) and which never goes on the wire. No upgrade step is needed.
