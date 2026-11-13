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

Upgrade: code that reads `mcp` (an endpoint's `signalOption.mcp`, `SliceCls.mcp`, a serialized endpoint's `mcp` or a serialized signal's `mcp` map) to decide whether an entry is on `/mcp` must test for listed, `(mcp ?? true) === true`. A check of `mcp !== false`, or a truthiness test, now lets `"agent"` through as listed. A workspace's copied `libs/shared` `AccountMiddleware` had exactly that check, which let an MCP client's OAuth token reach an `mcp: "agent"` endpoint over HTTP, so port its fix. Code that only declares `mcp: false` or `mcp: true` needs no change.
