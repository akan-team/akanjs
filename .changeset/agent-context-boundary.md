---
"akanjs": minor
---

What an agent turn carries beside the conversation reaches the model as marked data in a user turn, outside the system prompt.

- **A turn's `context` is no longer written into the system prompt.** `OpenaiDialect` and `AnthropicLlm` send it as a `<turn-context …>` block that ends the turn's last user-role content, after that turn's tool results: a text block on the Messages API, and on the chat-completions wire the end of the user message the turn closes on, or a user message of its own after tool messages. The block closes on a delimiter chosen so that its content cannot contain it. The system prompt is the instructions alone, so it is the same text on every turn of a conversation and a provider's prefix cache keeps it.
- **`LlmContext`** (`akanjs/service`) builds that block: `LlmContext.of(request.context)` is the text, empty when there is no context.
- **A context block can be marked `untrusted: true`** (`AgentWireContext`, and `ContextBlock` in the page) when it holds text someone other than the developer or the user may have written. Both dialects fence marked blocks apart from the app's own, in a `<page-content …>` block, the one a `readScreen` result arrives in. A turn that carries one counts as an untrusted read. In the page the first change after it asks the user first, as after `readScreen`. In `agentService.loop` the run is tainted from its first round: `approve` hears `tainted: true`, and with no `approve` a write is refused with the sentence a write after an untrusted result gets.
- **Text from a mentioned record is treated like text a tool read.** An `@` mention's reference reaches the model with its pointer, label, value and note together in one `<page-content …>` block under the "Referenced data" heading; before, only the value was fenced. A message that carries a reference counts as an untrusted read: in `Agent.Chat` the first change after it shows the approval card a change after `readScreen` shows, and an `agentService.loop` run whose messages carry `references` is tainted from its first round.
- **The page's default context keeps ids, enum members, numbers and booleans inline, and leaves free text to `readState`.** A store string rides the `state` block only when it is one token: up to 40 letters, digits, `.`, `_` or `-`. Any other string is listed by key and type with no value; it used to ride inline up to 200 characters. The `route` block follows the same rule for each path segment, path param and search param, key and value alike: what does not pass is left out (`…` in the path), and the block names the keys to read in `withheld`. `readState` answers `pathname`, `params` and `searchParams` whether or not a component subscribes them, as page content.
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

An app that relied on the model seeing a search param, a path param or a short store string in its context now has the model read it with `readState`. The model is told which keys to read, so most apps change nothing. Two cases need an edit. Instructions that point at the context point at the tool instead:

```tsx
// before
<Agent.Chat instructions="The search box's text is searchParams.q in the route context." />
// after
<Agent.Chat instructions="The search box's text is the q search param: call readState with key searchParams." />
```

And a chat or zone that withholds `readState` gives it back when its agent needs such a value:

```tsx
// before
<Agent.Zone builtins={["readScreen"]}>
// after
<Agent.Zone builtins={["readScreen", "readState"]}>
```

What `readState` returns is page content, so the first change after it asks the user first, as after `readScreen`.

A chat where the user mentions a record now asks before the first change that follows. `AgentConfirm.set({ afterScreenRead: false })` turns that off together with the ask after `readScreen`. A loop that passes user messages with `references` and has no `approve` no longer writes: pass `approve`, or send the message without `references`.

`AnthropicLlm.systemPrompt(request)` and `OpenaiDialect.systemPrompt(request)` return the instructions without the context. A test that looked for a context value in `body.system`, or in the first chat-completions message, finds it in the last user-role content.
