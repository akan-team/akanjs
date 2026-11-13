---
"akanjs": minor
"@akanjs/cli": patch
---

`agentService.loop` now recovers from a model call refused for length, the way the in-page chat does, instead of ending the run.

- With `compact` set, a round whose call fails as `agent.error.contextOverflow` compacts at once, whatever `at` says, emits `compacted` as usual, and asks again.
- The retry is part of the same round. A second refusal, a transcript with nothing to cut, or a summary that fails ends the run with the original error, as before.
- The refused attempt is metered as a `failed` turn with what the provider counted, which is nothing for a refusal an adaptor makes before any network call.
- When the refusal's data carries `limit` and `requested`, the run lowers `at` for its remaining rounds to where that request would have fit, so the next one compacts ahead instead of being refused. The two numbers may be in any unit, as long as it is the same one. An adaptor that caps the request body in bytes can throw `new Err("agent.error.contextOverflow", { limit, requested })` with its own byte counts.

A run without `compact` ends on the refusal as before. With `compact` set, a refused round now costs up to two more model calls (the summary and the retry) before the run ends.
