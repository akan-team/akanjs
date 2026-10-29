---
"akanjs": patch
---

Add `option.setAgentRequestPolicy((request, { account, ip }) => request)`. The browser writes a `runAgentTurn` request's instructions, tools and transcript, so the access guard decides who may spend the LLM key but nothing decided what they spend it on: a caller past the guard could send a hand-built turn and use the key as a plain LLM. The policy sees each turn after the guard and before the quota hook and the model, with tool names as the page published them, and returns the request to send — a server-fixed lead to the instructions, a tool allowlist, caps, a per-turn `model` — or throws an `Err` to refuse it (`agent.error.requestRefused` is new for that), which answers with its own status before any stream opens. Without a policy nothing changes.
