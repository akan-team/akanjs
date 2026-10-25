---
"@akanjs/cli": patch
"@akanjs/devkit": patch
"akanjs": patch
---

Guideline text (`akan guideline show <name>`, MCP `get_guideline`) catches up with 3.1.0:

- `workspaceOnboarding`, `conventions` and `ssrRule` gate a signed-in layout with `.guard(() => signedIn())` from `@libs/shared/webkit`, which a new workspace has only with `create-workspace --libs true`. `ssrRule` says a crawler gets a late redirect as a real 3xx.
- `queryRule` and `workspaceRecipes` count `purge<Filter>` among a filter's methods, and `queryRule` says which queries a purge refuses.
- `workspaceRecipes` and the `akan-store` skill list `invalidate<Model>()`, and the `workspaceRecipes` page sample no longer awaits its view.
- `transportRule` adds a 408 and a 409 `idempotencyInFlight` to what `retry` retries.
- `modelDocument` points search at a `text` role rather than a `"text"` index.
- `runtimeRule` says an edge server starts with `/mcp` off and that `operationMode` scopes whole modules.
- `workspaceOnboarding` says only `--sign true` code-signs a `publish-update` release.
- `conventions`, `runtimeRule` and the READMEs name Bun 1.4.4, and the `mcp`, `apps` and `modern` server options describe the edge default and MCP Apps as shipped.
