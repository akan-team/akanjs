---
"akanjs": patch
---

`agentService.loop` keeps one call's usage, results and answers from landing on another call.

- Two runs, or two turns, stopped by one `AbortController` no longer bill one call's usage to the other with `OpenaiLlm` and `AnthropicLlm`: a run stopped before its provider answered was reported with the tokens another run had streamed. `llmCallSignal` now stops each provider call under an `AbortError` of its own, which names the caller's reason as its `cause`, where it used to pass the caller's reason object on; the 120-second limit still ends a call as a `TimeoutError`, on a turn reported `failed`, not `aborted`. An app that shares one controller across runs changes nothing.
- A model that reuses a tool-call id from an earlier turn no longer ends the conversation when its later call goes unanswered. The earlier call's result made the later one look answered, so it got no "stopped before this call ran" result and the provider refused that request and every one after it. A result now answers the nearest call before it.

**Upgrading.** Code that calls a shipped adaptor's `chat` itself and compares the rejection with its own abort reason reads `error.cause` instead.
