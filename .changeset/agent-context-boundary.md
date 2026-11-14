---
"akanjs": minor
---

What an agent turn carries beside the conversation reaches the model as marked data in a user turn, outside the system prompt.

- **A turn's `context` is no longer written into the system prompt.** `OpenaiDialect` and `AnthropicLlm` send it as a `<turn-context …>` block that ends the turn's last user-role content, after that turn's tool results: a text block on the Messages API, and on the chat-completions wire the end of the user message the turn closes on, or a user message of its own after tool messages. The block closes on a delimiter chosen so that its content cannot contain it. The system prompt is the instructions alone, so it is the same text on every turn of a conversation and a provider's prefix cache keeps it.
- **`LlmContext`** (`akanjs/service`) builds that block: `LlmContext.of(request.context)` is the text, empty when there is no context.
- **A context block can be marked `untrusted: true`** (`AgentWireContext`, and `ContextBlock` in the page) when it holds text someone other than the developer or the user may have written. Both dialects fence marked blocks apart from the app's own, in a `<page-content …>` block, the one a `readScreen` result arrives in. A turn that carries one counts as an untrusted read. In the page the first change after it asks the user first, as after `readScreen`. In `agentService.loop` the run is tainted from its first round: `approve` hears `tainted: true`, and with no `approve` a write is refused with the sentence a write after an untrusted result gets.
- `AgentService.preamble` and each adaptor's fallback prompt say what a `<turn-context …>` block is, and that a `<page-content …>` block may also end a user turn.

**Upgrading.** An `LlmAdaptor` of your own that builds its request with `OpenaiDialect.requestBody` or `AnthropicLlm.requestBody` needs no change. One that reads `request.context` itself should stop writing it into the system prompt and append `LlmContext.of(request.context)` to the last user-role content instead:

```ts
// before
const system = `${request.instructions}\n\n${JSON.stringify(request.context)}`;
// after
const system = request.instructions;
const context = LlmContext.of(request.context); // "" when the turn carries none
```

An adaptor that builds its own request gets the marked blocks fenced by the same call. A loop request or a page context that already used a field named `untrusted` on a block for something else must rename it: any value but `false` or `undefined` now marks the block.

`AnthropicLlm.systemPrompt(request)` and `OpenaiDialect.systemPrompt(request)` return the instructions without the context. A test that looked for a context value in `body.system`, or in the first chat-completions message, finds it in the last user-role content.
