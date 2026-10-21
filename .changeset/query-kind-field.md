---
"akanjs": patch
---

A model with its own `kind` field can be queried by it. `{ kind: "image" }` used to be read as a query node because it carried a `kind` key. The SQL compiler then threw "Operator nodes must be attached to a document path", a live room never matched, and an upsert inserted the row without the query's fields. A value now counts as a node only when it has a node's whole shape, so `{ kind: "image" }`, `{ kind: q.oneOf([...]) }` and `{ kind: "all" }` are field queries. The check is exported as `isDocumentQueryNode`.
