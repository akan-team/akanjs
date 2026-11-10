---
"akanjs": minor
"@akanjs/cli": patch
---

`this.agentService.loop(request)` runs a model over the `/mcp` tool catalogue in-process until it answers. It needs no browser, so a queued task, a scheduled run or a reply to a mention can use it.

- **Events.** It returns an async iterable of `text`, `toolCall`, `toolResult`, `usage`, `compacted` and `awaiting` events. The stream ends with exactly one `done { stop, rounds }` or `error`. `stop` is one of `end`, `maxRounds`, `budget`, `aborted`, `length`, `quota`, `unauthorized` or `awaiting`. The loop waits for the consumer at every event.
- **Accounts.** A request carries either `account`, a snapshot the server resolved, or `principal`, a stored id. A new `option.setAgentAccountResolver((principal) => account | null)` resolves the principal at the start and before every round. If it resolves to `null`, the run ends as `"unauthorized"`. The model is offered `allow` ∩ what the account sees on `/mcp`.
- **Approval and taint.**
  - `untrusted(result)` marks a result as untrusted. Every later call reaches `approve(call, { tainted, tool })` with `tainted` set. `approve` returns `"allow"`, `"defer"` or `{ deny }`.
  - Without `approve`, a `needsConfirm` tool is refused, and so is every write once the run is tainted.
  - `"defer"` holds the whole batch, emits `awaiting`, and ends the run.
- **Resume.**
  - `onMessage` is awaited for each message the run appends.
  - Calling `loop` again with the stored messages asks `approve` again about any trailing calls nothing answered, and rebuilds the taint from the stored results.
  - `compact { at, keep }` summarizes the head of the transcript. The `compacted` event names how many messages the summary replaced.
- **Metering.**
  - Each model call is its own turn for the request policy, the quota and the usage hook. That includes compactions.
  - `AgentTurnContext` gains `loop { id, round }` and `meta`, which is copied from the request.
  - A loop turn has empty headers and a `null` ip. The relay's default size caps do not apply to loop rounds.
- **Limits.** The run is bounded by `maxRounds` (default 12), `budget { tokens, toolCalls, wallMs }` and `signal`. There is no preamble unless `preamble` gives one. A tool result is capped at 20,000 characters, as the browser caps it.
- **Moved.** `AgentMeter` and `AgentRelayPolicy` now live in `akanjs/service`, and `akanjs/signal` still re-exports them.

The `AgentTurnContext` fields are optional and the moved classes are still exported from `akanjs/signal`, so no upgrade step is needed.
