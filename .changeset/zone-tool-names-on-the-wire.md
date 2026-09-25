---
"akanjs": patch
---

Rename a zone's scope-prefixed tools onto what a provider's function-calling wire accepts.

A zone publishes `<id>.<name>`, which is legal for MCP but rejected by every OpenAI-compatible and Anthropic
function schema — those allow `[A-Za-z0-9_-]` only, up to 64 characters. The name went to the provider verbatim.
A validating provider answers 400; DeepSeek did not, and what happened instead was harder to find: the model
normalized the illegal name itself, called the bare tool, and the browser answered `Unknown tool` for a tool that
was published all along, spending a turn.

`AgentService.runTurn` now renames every tool name in the request — the published tools and the calls the
transcript still carries — and reads the answer back under the name the surface registered. A request whose names
already fit is handed on as the same object, so the root agent's turn is unchanged. `Agent.Context`'s Assemble
now lists the published tool names, which is where a prefix mismatch is visible in one glance.
