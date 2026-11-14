---
"akanjs": minor
"use-agentic": minor
"@akanjs/cli": patch
---

`agentService.loop` now recovers from a model call refused for length, the way the in-page chat does, instead of ending the run. Both now read a refusal's `limit` in the refusal's own unit when it also gives `requested`.

- With `compact` set, a round whose call fails as `agent.error.contextOverflow` compacts at once, whatever `at` says, emits `compacted` as usual, and asks again.
- The retry is part of the same round. A second refusal, a transcript with nothing to cut, or a summary that fails ends the run with the original error, as before.
- The refused attempt is metered as a `failed` turn with what the provider counted, which is nothing for a refusal an adaptor makes before any network call.
- When the refusal's data carries `limit` and `requested`, the run lowers `at` for its remaining rounds to where that request would have fit, so the next one compacts ahead instead of being refused.
- The relay now forwards `requested` beside `limit` on the wire's `overflow` (`TurnOverflow`). Given both, the chat scales its own estimate of the refused prompt by `limit / requested` to get the window it adopts. Given `limit` alone, the chat still takes it as the window in tokens.
- The two numbers may be in any unit, as long as it is the same one. An adaptor that caps the request body in bytes can throw `new Err("agent.error.contextOverflow", { limit, requested })` with its own byte counts, and neither the loop nor the chat mistakes them for tokens.

A run without `compact` ends on the refusal as before. With `compact` set, a refused round now costs up to two more model calls (the summary and the retry) before the run ends. `AgentTurnStream.failure(...).overflow` and `RunnerEvent`'s error `overflow` gain an optional `requested`; code reading only `limit` needs no change.
