---
"@akanjs/cli": patch
---

The `conventions` guideline (`akan guideline show conventions`, MCP `get_guideline`) now says that a raw `<button>` defaults to `type="submit"` and must say `type="button"` when it does not submit. The button samples in `agentRule` and `workspaceRecipes` now carry `type="button"`.
