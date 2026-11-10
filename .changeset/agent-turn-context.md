---
"akanjs": minor
"@akanjs/cli": patch
---

The agent relay's hooks share one turn, and every turn the quota passes is billed, including one that fails or whose caller goes away.

- **One turn from the policy to the usage report.** `setAgentRequestPolicy`, `setAgentQuota` and `setAgentUsage` receive the same `AgentTurnContext`: `{ id, headers, account, ip }`. `id` is new for every turn, so an app can match a quota hold with the usage report that settles it, and `headers` lets it read an org header to pick the account to bill, once it has checked that the caller belongs to that org. The quota check also carries the `request` the policy returned. `AgentRequestContext` is deprecated.
- **Usage for every turn the quota passed.** The usage report carries an `outcome`.
  - `ok`: the turn finished.
  - `failed`: the provider or the network ended it. The report holds what the provider spent before then, such as the prompt of an Anthropic stream that broke after `message_start`, and the model.
  - `aborted`: the caller went away first.
  - A turn that spent nothing, such as one the provider refused, is reported with zero usage. Before, a failed turn and a turn without counts were not reported at all.
  - A failed or aborted turn holds the caller's next turn until its report settles, as a finished one does.
- **A streamed turn whose reader goes away stops the provider call**, so the turn stops spending tokens on an answer nobody will read. `LlmAdaptor.chat` takes an optional third argument, `signal`, which the relay sends with `onDelta`, and both built-in adaptors pass it to `fetch`. A plain turn whose client left answers 499 rather than logging a server error.
- **Cache writes reported separately.** `LlmUsage.cacheWriteTokens` is the part of `inputTokens` the provider wrote to its cache, which Anthropic bills above its input rate. `inputTokens` still counts the whole prompt.
- **`AgentService.runTurn(request, { onDelta, preamble, signal })`.** `preamble` replaces the in-page preamble, and `false` sends none, for a turn with no screen behind it. Passing `onDelta` alone as the second argument still works.
