---
"akanjs": patch
"@akanjs/cli": patch
---

A slice's per-verb `mcp` value now reaches the endpoints it generates. `mcp: { cru: false }` or `mcp: { get: "agent" }` used to be read only where `/mcp` builds its listing. Each generated `get`, `create`, `update` and `remove` endpoint now carries its own verb's value in its `signalOption.mcp`, as a slice's list already did. This lets server code that reads `signalOption.mcp`, such as `libs/shared`'s `AccountMiddleware`, refuse an MCP client's OAuth token there over HTTP as well.

`libs/shared`'s `AccountMiddleware` now refuses such a token at an `mcp: "agent"` endpoint, as it does at an `mcp: false` one. A workspace that copied `libs/shared` should port the one-line check in `srvkit/accountMiddleware.ts` (`(signalOption?.mcp ?? true) === true`).
