---
"akanjs": minor
---

A turn its caller stops is billed at what the provider plausibly charged, never at zero.

- A streamed turn whose reader leaves stops its provider call, and a stream cut short carries no counts of the provider's own: an OpenAI-compatible stream sends them only in its last chunk, and an Anthropic one only the prompt. Its usage report keeps every count the provider did send, estimates the rest from the request and the text and tool arguments streamed, and says so with `estimated: true` on `AgentUsageReport` and `LlmSpent`. The estimate takes three UTF-8 bytes a token and 1,600 tokens a picture, which errs high.
- A plain turn's answer shows nothing before its end to estimate from, so its provider call runs on after the client leaves. The client still gets a 499 at once, and the turn is reported `aborted` with the provider's own counts when the call ends. Until then it holds the caller's next turn, as any turn not yet reported does.
- `AgentRelayPolicy.apply` takes the old `{ account, ip }` context again and fills in a fresh `id` and empty `headers`. `AgentRequestContext` is that old shape again, and stays deprecated.

**Upgrading.** A usage hook receives failed and aborted turns. Before, a streamed turn whose reader left ran to its end and was billed as finished; it now stops early and is billed at its estimate. To bill as before, bill every report except `outcome === "failed"`. Billing only `ok` would leave a stopped turn unbilled while the provider charged for it. Read `estimated` to treat estimated counts differently.
