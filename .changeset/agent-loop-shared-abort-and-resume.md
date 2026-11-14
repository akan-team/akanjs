---
"akanjs": patch
"@akanjs/cli": patch
---

`agentService.loop` keeps one call's usage, results and answers from landing on another call.

- Two runs, or two turns, stopped by one `AbortController` no longer bill one call's usage to the other with `OpenaiLlm` and `AnthropicLlm`: a run stopped before its provider answered was reported with the tokens another run had streamed. `llmCallSignal` now stops each provider call under an `AbortError` of its own, which names the caller's reason as its `cause`, where it used to pass the caller's reason object on; the 120-second limit still ends a call as a `TimeoutError`, on a turn reported `failed`, not `aborted`. An app that shares one controller across runs changes nothing.
- A model that reuses a tool-call id from an earlier turn no longer ends the conversation when its later call goes unanswered. The earlier call's result made the later one look answered, so it got no "stopped before this call ran" result and the provider refused that request and every one after it. A result now answers the nearest call before it.
- A run that dies in the middle of a batch no longer runs the calls that had finished a second time when it is resumed. `onMessage` now receives a batch's results one tool message per call, as each call finishes and before its `toolResult` event, where it received one message per batch after the last call. A call that was still running when the run died cannot be told from one that never started: like any trailing call nothing answered, it goes to `approve` again and runs again, so a write that must not land twice needs an idempotent endpoint or an `approve` that defers it.
- A resume keeps the stricter taint rule it had. An uninterrupted run judges a batch before any of it runs, so a result of the batch never taints the calls beside it. A resumed run judges on everything stored: a result of the part-finished or parked batch that `untrusted` marks still taints the calls that batch has left, which are refused as writes or reach `approve` with `tainted: true`.
- `compact.keep` counts a batch's tool messages as one message, so a compaction keeps the rounds it kept before.

**Upgrading.** A caller that stores each message `onMessage` hands over, in order, and replays them changes nothing: a stored transcript with one tool message per batch still resumes. Code that expects exactly one tool message after an assistant message with tool calls, to render or pair them, must read every tool message up to the next message of another role. Code that calls a shipped adaptor's `chat` itself and compares the rejection with its own abort reason reads `error.cause` instead.
