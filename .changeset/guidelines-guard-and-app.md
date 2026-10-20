---
"@akanjs/cli": patch
---

Guideline text (`akan guideline show <name>`, MCP `get_guideline`) now covers the `.guard()` and `.app()` route stages.

- `pageRule` gains two sections. Route Guards says what a guard receives, how it refuses, when it runs on the server, on a client navigation and over MCP, and why it is no substitute for an endpoint's guards. MCP Apps explains `.app()`.
- `mcpRule` describes MCP Apps v2: one component of a page per tool, with a single-file view each. It also covers read-only deployments that keep their apps, and `.prompt()` as a briefing only.
- `conventions` and `ssrRule` gate a route with `.guard(() => signedIn())` in place of `getSelf({ unauthorize })` in a layout body. A redirect from a guard is a real 3xx.
- `pageRule` and `mcpRule` also say what a view draws around the element (the `_overrides.tsx` over the page), that a view never moves, and that a chain is the `export default` expression itself.
