---
"akanjs": patch
---

`/openapi.json` now lists the 404 `base.error.documentNotFound` that a generated `<model>`, `light<Model>`, `update<Model>` or `remove<Model>` can answer when its id names no live document, in the same `AkanError` shape as a declared error. A caller that a resource guard such as `Can<Verb><Model>` refuses still gets the guard's 403, since the guard fails closed when its own load misses. A document with such an endpoint now carries the `AkanError` component. `create<Model>`, the slice reads and custom endpoints are unchanged. Only OpenAPI changes: the MCP `tools/list`, the in-page agent's tools and the server's `errors` checks read none of it, so a tool's description gains no line and `base.error.*` is still never declared in an endpoint's `errors`. The answer itself is unchanged, and so is the level each miss is logged at.
