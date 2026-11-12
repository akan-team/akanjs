---
"akanjs": patch
---

A generated `<model>` or `light<Model>` read asked for an id that does not exist now logs its 404 at debug, not as an ERROR line. A page guard that checks a document exists, such as `await fetch.memo(memoId)`, used to send every stale link, crawler hit or made-up id to error alerts. The caller still gets the same 404 `base.error.documentNotFound`, and OpenAPI and the MCP catalogue are unchanged. A missing document anywhere else still logs as an error: in a generated `update<Model>` or `remove<Model>`, and in a custom endpoint or service, such as one following an id it stored. A generated read's other failures, a guard's refusal included, still log as they did.
