---
"akanjs": minor
---

What an agent turn carries beside the conversation reaches the model as marked data in a user turn, outside the system prompt.

- **A turn's `context` is no longer written into the system prompt.** `OpenaiDialect` and `AnthropicLlm` send it as a `<turn-context …>` block that ends the turn's last user-role content, after that turn's tool results: a text block on the Messages API, and on the chat-completions wire the end of the user message the turn closes on, or a user message of its own after tool messages. The block closes on a delimiter chosen so that its content cannot contain it. The system prompt is the instructions alone, so it is the same text on every turn of a conversation and a provider's prefix cache keeps it.
- **`LlmContext`** (`akanjs/service`) builds that block: `LlmContext.of(request.context)` is the text, empty when there is no context.
- `AgentService.preamble` and each adaptor's fallback prompt say what a `<turn-context …>` block is.

**Upgrading.** An `LlmAdaptor` of your own that builds its request with `OpenaiDialect.requestBody` or `AnthropicLlm.requestBody` needs no change. One that reads `request.context` itself should stop writing it into the system prompt and append `LlmContext.of(request.context)` to the last user-role content instead:

```ts
// before
const system = `${request.instructions}\n\n${JSON.stringify(request.context)}`;
// after
const system = request.instructions;
const context = LlmContext.of(request.context); // "" when the turn carries none
```

`AnthropicLlm.systemPrompt(request)` and `OpenaiDialect.systemPrompt(request)` return the instructions without the context. A test that looked for a context value in `body.system`, or in the first chat-completions message, finds it in the last user-role content.
