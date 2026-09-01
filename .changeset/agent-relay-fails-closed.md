---
"akanjs": patch
---

fix: refuse `runAgentTurn` until the app names an `AgentRelayAccess` guard

The relay used to allow every caller and warn at boot until an app decided. With no guard it now answers like
`None` — `Access denied by guard: AgentRelayAccess` — and boot is silent. Name one with
`option.setAgentAccess(...)` (or `AgentRelayAccess.use`) before the chat can spend the LLM key.
