---
"akanjs": minor
---

`AnthropicLlmOption.body` may return any body the API takes. The return type is now `AnthropicSentBody`, which pins only `messages` and `tools`, the two fields the retries read. A hook can send `system` as text blocks carrying a `cache_control` breakpoint, or put one on a tool, without a cast.

A failed agent turn is logged once:
- A refusal `LlmOverflow` already logged at warn (`agent.error.llmRequestFailed`, `agent.error.llmDeclined`) is no longer logged again as an error by `AnthropicLlm` or `OpenaiLlm`.
- A context overflow, which the chat compacts and asks again, is logged at warn.
- Any other failure, such as a network error, stays an error.

The new `LlmOverflow.failed(logger, provider, error)` holds that choice.

An `AnthropicLlm.of(...)` instance names `AnthropicLlm.of` rather than `option.setLlm` when it warns about a missing key or an empty answer.

Upgrading needs no step: a hook that returned the earlier type still type-checks.
