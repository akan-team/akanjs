---
"akanjs": minor
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`mcp: "agent"` keeps an entry off `/mcp` and leaves it to the in-process agent. `AgentToolsRole`'s `listAs` and `callAs`, and so `agentService.loop`, still list and run it. `/mcp` neither lists nor runs it, and `listingCost` leaves it out. An app whose `/mcp` listing is near its size budget can now give a server agent more tools without growing that listing.

- **Where it goes.** It goes wherever `mcp: false` goes: an endpoint, a slice's `init()`, the bare `slice()` value, or one key of its map (`mcp: { cru: "agent" }`). It is curation, not authorization. Guards, person-only guards (`static agents = false`), `readOnly` and `setMcp({ excludeSignals, excludeEndpoints })` still apply to both catalogues, and HTTP is unchanged.
- **Lib slices.** An app slice that declares no `mcp` map now keeps the narrowest value its lib slices set: `false`, then `"agent"`, then listed.
- **MCP Apps.** A rendered view may still call an `mcp: "agent"` entry, as it may call an `mcp: false` one.
- **Types.** `McpShelf` (`boolean | "agent"`) and `narrowestMcpShelf` are new in `akanjs/common`. `SerializedSignalShelf` is new in `akanjs/signal`. `McpDocumentOptions` and `McpExposureOption` gain `agent`.

Upgrade: code that reads `SliceCls.mcp`, a serialized endpoint's `mcp` or a serialized signal's `mcp` map as a boolean must now compare it with `false` or `true`. `"agent"` is truthy, and it means "not on `/mcp`". Code that only declares `mcp: false` or `mcp: true` needs no change.
