---
"akanjs": patch
---

A mutation repeated under its `Idempotency-Key` replays the response it sent, byte for byte, never its handler's result. What the cache backend (Redis, or the SQLite-backed cache) keeps for 24 hours is that answer as it went out — relations and computed fields resolved, `field.hidden` and `field.secret` values masked, serialized — so neither value reaches the cache. A run whose handler succeeded but whose answer then failed (a relation that no longer exists) keeps that failure for the same 24 hours, a transient one (a database blip while a relation is read) included, so a repeat answers it rather than running the handler twice. A call through MCP is never deduplicated: the header belongs to its JSON-RPC request, not to one tool call.
