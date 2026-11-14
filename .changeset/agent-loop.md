---
"akanjs": minor
"@akanjs/cli": patch
---

`this.agentService.loop(request)` runs a model over the `/mcp` tool catalogue in-process until it answers. It needs no browser, so a queued task, a scheduled run or a reply to a mention can use it.

- **Events.** It returns an async iterable of `text`, `toolCall`, `toolResult`, `usage`, `compacted` and `awaiting` events. The stream ends with exactly one `done { stop, rounds }` or `error`. `stop` is one of `end`, `maxRounds`, `budget`, `aborted`, `length`, `quota`, `unauthorized` or `awaiting`. The loop waits for the consumer at every event.
- **Accounts.** A request carries either `account`, a snapshot the server resolved, or `principal`, a stored id. A new `option.setAgentAccountResolver((principal) => account | null)` resolves the principal at the start and before every round. If it resolves to `null`, the run ends as `"unauthorized"`, as does a missing or falsy `account`: there is no anonymous run. The model is offered `allow` ∩ what the account sees on `/mcp`, and a call to a name that round did not list is answered as an unknown tool, neither asked about nor run. A request with no `allow` array is an `error`.
- **Approval and taint.**
  - `untrusted(result)` says which results are untrusted; with none given, every result of a call that ran is. Every later call reaches `approve(call, { tainted, tool })` with `tainted` set. `approve` returns `"allow"`, `"defer"` or `{ deny }`.
  - Without `approve`, a `needsConfirm` tool is refused, and so is every write once the run is tainted. `AgentToolsRole`'s `listAs` now marks a mutation MCP calls destructive as `needsConfirm`. `purge`, `destroy`, `erase`, `wipe`, `drop`, `cancel`, `bulkRemove` and `bulkDelete` keys now count alongside `remove` and `delete`, which also changes those tools' `destructiveHint` on `/mcp`, and a new `destructive` endpoint option overrides the key.
  - `"defer"` holds the whole batch, emits `awaiting`, and ends the run.
- **Resume.**
  - `onMessage` is awaited for each message the run appends.
  - Calling `loop` again with the stored messages asks `approve` again about any trailing calls nothing answered, and rebuilds the taint from the stored results.
  - `compact { at, keep }` summarizes the head of the transcript. The `compacted` event names how many messages the summary replaced.
  - A summary or tool message now carries `tainted`, new and optional on `AgentWireMessage`, so a resumed transcript stays tainted. Store each whole. A summary with no marker counts as tainted, as what it replaced cannot be judged.
  - A batch's results reach `onMessage` even when the consumer stops reading or a later call throws, so a resume runs only calls that never started.
- **Metering.**
  - Each model call is its own turn for the request policy, the quota and the usage hook. That includes compactions.
  - `AgentTurnContext` gains `loop { id, round }` and `meta`, which is copied from the request.
  - A loop turn has empty headers and a `null` ip. The relay's default size caps do not apply to loop rounds, unless the run lists `clientTools`.
- **Limits.**
  - The run is bounded by `maxRounds` (default 12), `budget { tokens, toolCalls, wallMs }` and `signal`. A limit that is not a valid number is an `error` before any model call.
  - `wallMs` and `signal` also end a run waiting on a tool or on `approve`. `callAs` cannot cancel a call, so the run stops waiting and answers it with an error saying it may still finish. A resume does not run it again, and the endpoint runs on with its outcome unreported.
  - There is no preamble unless `preamble` gives one. With no `instructions` either, a short neutral prompt stands in, as each adaptor's own fallback is about a screen.
  - A tool result is capped at 20,000 characters, as the browser caps it. `untrusted` sees it before the cap.
- **Moved.** `AgentMeter` and `AgentRelayPolicy` now live in `akanjs/service`, and `akanjs/signal` still re-exports them.

- **Streams.** An error frame inside a provider's stream now fails the turn instead of reading as a finished answer. A stream that ends with no terminal event, or with tool arguments that do not parse, now stops as `length`, so those calls do not run with empty arguments and a half answer is not reported as finished. Parallel calls from a gateway that omits or reuses `index` now stay separate. This also applies to the in-page chat.

The `AgentTurnContext` fields are optional and the moved classes are still exported from `akanjs/signal`, so no upgrade step is needed.
