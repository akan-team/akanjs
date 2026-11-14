---
"akanjs": minor
---

The OpenAI-dialect and Anthropic adaptors read more of how a stream ends.

- A stream that closes on its end marker alone (`[DONE]`, or Anthropic's `message_stop`) with no finish reason, after a tool call whose arguments never arrived, now ends as `length` instead of running that call with `{}`. A tool that takes no arguments still runs. `OpenaiDialect.consumeStream` and `AnthropicLlm.consumeStream` take the turn's tools as a fourth argument to tell the two apart; called without them, every such call counts as cut.
- Tool-call arguments that are not one JSON object, in an answer the provider finished, no longer end the turn as `length` with a "ran out of room" message. The call gets `argsError` (and `args: {}`), and `agentService.loop` answers it with that parse error and the code `invalidArgument` instead of running it, so the model can write it again. Only an answer actually cut short is `length`. The in-page relay has no way to hand a call its error, so it still ends such a turn as `length`, and no longer runs a whole (non-streamed) answer's malformed call with `{}`.

No upgrade step is needed: the new arguments and fields are optional.
