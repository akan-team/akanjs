---
"akanjs": minor
"@akanjs/cli": patch
---

A service can now run the `/mcp` tool catalogue in-process, as a given account, with `plug(AgentToolsRole)`.

- **`listAs(account, { allow })`** returns the tools that account may see on `/mcp`, with the same names, descriptions, input schemas and guard filtering. Each tool also carries `readOnly`. `allow` narrows the list by tool name and never widens it.
- **`callAs(account, call)`** runs one call as the account and returns an `AgentWireToolResult`. The call goes through the endpoint's guards, middlewares, `mcp: false`, `Person` refusals, masking and rate limits, with `origin` `"mcp"`. A refusal or a failure comes back as the result's `error`, with the same text `/mcp` sends. An image result comes back as attachments.
- **The account is trusted.** It is put on the call after the global middleware chain, so pass one the server resolved, never client input. `authorization`, `cookie` and `origin` are dropped from the headers a call forwards. `ip` sets what `getClientIp()` reads; without it, ip-scoped rate limits share one budget.
- The catalogue follows `option.setMcp`'s `readOnly`, `excludeSignals`, `excludeEndpoints` and `language`. It is available on every server, batch servers included, even when `/mcp` is off.
