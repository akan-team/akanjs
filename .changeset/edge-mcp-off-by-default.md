---
"akanjs": minor
---

An edge server (`AKAN_PUBLIC_OPERATION_MODE=edge`) starts with MCP off: it runs on premises for its own screens and machines, so `/mcp` is not served there unasked. Upgrade note: an edge deployment that serves MCP turns it back on with `AKAN_MCP=true` or `option.setMcp(true)`.
