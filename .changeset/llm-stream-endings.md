---
"akanjs": minor
---

The OpenAI-dialect and Anthropic adaptors read more of how a stream ends.

- A stream that closes on its end marker alone (`[DONE]`, or Anthropic's `message_stop`) with no finish reason, after a tool call whose arguments never arrived, now ends as `length` instead of running that call with `{}`. A tool that takes no arguments still runs. `OpenaiDialect.consumeStream` and `AnthropicLlm.consumeStream` take the turn's tools as a fourth argument to tell the two apart; called without them, every such call counts as cut.

No upgrade step is needed: the new arguments and fields are optional.
