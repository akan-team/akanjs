---
"akanjs": minor
---

The OpenAI-dialect and Anthropic adaptors read more of how a stream ends.

- A stream that closes on its end marker alone (`[DONE]`, or Anthropic's `message_stop`) with no finish reason, after a tool call whose arguments never arrived, now ends as `length` instead of running that call with `{}`. A tool that takes no arguments still runs. `OpenaiDialect.consumeStream` and `AnthropicLlm.consumeStream` take the turn's tools as a fourth argument to tell the two apart; called without them, every such call counts as cut.
- Tool-call arguments that are not one JSON object, in an answer the provider finished, no longer end the turn as `length` with a "ran out of room" message. The call gets `argsError` (and `args: {}`), and `agentService.loop` answers it with that parse error and the code `invalidArgument` instead of running it, so the model can write it again. The loop stores that answer before anything else in the batch runs or parks, so the refusal is in the transcript as a result. Only an answer actually cut short is `length`. The in-page relay has no way to hand a call its error, so it still ends such a turn as `length`, and no longer runs a whole (non-streamed) answer's malformed call with `{}`.
- vLLM's bare `{"object":"error", ...}` frame and a `finish_reason` of `"error"` (OpenRouter's, for an upstream that failed mid-answer) now fail the turn as `agent.error.llmRequestFailed`, or `contextOverflow` when the message says the prompt did not fit, instead of reading as an empty or truncated answer. The failure carries the provider's counts, or an estimate of what was streamed.
- An error inside a stream keeps the status its type names in `agent.error.llmRequestFailed`'s `status`, where Anthropic's always read 500: `overloaded_error` is 529, `rate_limit_error` 429, `invalid_request_error` 400, and so on. An OpenAI-dialect error frame with no numeric code is read the same way from its `code` or `type` (`rate_limit_exceeded` is 429). A type no table names is still 500.

**Upgrading.** Store an assistant message's tool calls whole, `argsError` included: a transcript `agentService.loop` resumes from should carry the flag, though a malformed call the loop already answered is not run again without it. The new arguments are optional.
