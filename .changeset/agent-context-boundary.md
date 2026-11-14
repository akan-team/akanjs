---
"akanjs": minor
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

What an agent turn carries beside the conversation reaches the model as marked data in a user turn, outside the system prompt.

- **A turn's `context` is no longer written into the system prompt.** `OpenaiDialect` and `AnthropicLlm` send it as a `<turn-context …>` block that ends the turn's last user-role content, after that turn's tool results: a text block on the Messages API, and on the chat-completions wire the end of the user message the turn closes on, or a user message of its own after tool messages. The block closes on a delimiter chosen so that its content cannot contain it, in any case or width. The system prompt is the instructions alone, so it is the same text on every turn of a conversation and a provider's prefix cache keeps it.
- **A compaction summary is history in a user turn on both dialects.** It is sent as a `<conversation-summary …>` block. The chat-completions dialect used to send it with the system role, and the Messages API mapping with no fence.
- **`LlmContext`** (`akanjs/service`) is what an adaptor of the app's own calls: `LlmContext.of(request.context)` is the context text, empty when there is none, and `LlmContext.summary(text)` the summary block.
- **A context block can be marked `untrusted: true`** (`AgentWireContext`, and `ContextBlock` in the page) when it holds text someone other than the developer or the user may have written. Both dialects fence marked blocks apart from the app's own, in a `<page-content …>` block, the one a `readScreen` result arrives in. A turn that carries one counts as an untrusted read. In the page the first change after it asks the user first, as after `readScreen`. In `agentService.loop` the run is tainted from its first round: `approve` hears `tainted: true`, and with no `approve` a write is refused with the sentence a write after an untrusted result gets. The run stores `tainted: true` on each assistant message it writes while tainted, so a resume and the next ask in that conversation keep the taint when the block is not passed again.
- **Text from a mentioned record is treated like text a tool read.** An `@` mention's reference reaches the model with its pointer, label, value and note together in one `<page-content …>` block under the "Referenced data" heading; before, only the value was fenced. The token in the user's message is sent as `@[pointer](mention:pointer)`, so the record's title is in that block only; the chat still draws the title. A message that carries a reference counts as an untrusted read: in `Agent.Chat` the first change after it shows the approval card a change after `readScreen` shows, and an `agentService.loop` run whose messages carry `references` is tainted from its first round. A loop's compaction digest names a pointed-at record by its pointer.
- **The page's default context keeps ids, enum members, numbers and booleans inline, and leaves free text to a read tool.**
  - A string rides inline only when it is one token: up to 40 letters, digits, `.`, `_` or `-`, and with more than two of those separators only when every part is hex or digits, as in a UUID. It used to ride inline up to 200 characters.
  - In the `state` block any other string is listed by key and type with no value.
  - The `route` block applies the rule to each path segment, path param and search param, key and value alike, and keeps at most twelve segments and twelve values of each kind. What is left out reads `…` in the path, and the block names the keys to read in `withheld`. `readState` answers `pathname`, `params` and `searchParams` whether or not a component subscribes them, as page content.
  - In the `screen` block a `Load` scope's label, which is its record's title, and the labels of a list scope's `items` follow the rule; the block then says to read the scope with `readScreen`.
  - Not covered: an `Agent.Zone`'s `label` and a value published with `st.expose`, `st.useState` or `useAgentResource` still ride whole, as no read tool returns them. Publish an id or an enum member there, not text a user wrote.
- The MCP App view names its screen to the host by origin and path under the same rule, without the query string or the hash.
- `AgentService.preamble` and each adaptor's fallback prompt say what a `<turn-context …>` block is, and that a `<page-content …>` block may also end a user turn.
- The agent and MCP guidelines and the `akan-agent` skill describe all of the above.

**Upgrading.**

An `LlmAdaptor` of your own that builds its whole request with `OpenaiDialect.requestBody` or `AnthropicLlm.requestBody` needs no change. One that builds its own messages must change, also when it takes its system prompt from `OpenaiDialect.systemPrompt(request)` or `AnthropicLlm.systemPrompt(request)`: those now return the instructions without the context, so such an adaptor would send no context at all. Append the context to the last user-role content, and map a `summary` message to a user turn:

```ts
// before
const system = OpenaiDialect.systemPrompt(request); // held the context
const turns = request.messages.map((message) =>
  message.summary ? { role: "system", content: message.text } : toTurn(message),
);
// after
const system = OpenaiDialect.systemPrompt(request); // the instructions alone
const turns = request.messages.map((message) =>
  message.summary ? { role: "user", content: LlmContext.summary(message.text ?? "") } : toTurn(message),
);
const context = LlmContext.of(request.context); // "" when the turn carries none
if (context) turns.push({ role: "user", content: context }); // or append it to the last user turn
```

Marked blocks come fenced by the same call. A test that looked for a context value in `body.system`, or in the first chat-completions message, finds it in the last user-role content, and one that looked for a summary in a system message finds it in a user message.

A loop request or a page context that already used a field named `untrusted` on a block for something else must rename it: any value but `false` or `undefined` now marks the block.

A store for `agentService.loop` messages must keep `tainted` on assistant messages too. Store each message `onMessage` hands over whole, as before; a store that picks fields adds this one. A loop that passes user messages with `references` and has no `approve` no longer writes: pass `approve`, or send the message without `references`.

An app that relied on the model seeing a search param, a path param, a short store string or a list row's title in its context now has the model read it with `readState` or `readScreen`. The model is told which to call, so most apps change nothing. Two cases need an edit. Instructions that point at the context point at the tool instead:

```tsx
// before
<Agent.Chat instructions="The search box's text is searchParams.q in the route context." />
// after
<Agent.Chat instructions="The search box's text is the q search param: call readState with key searchParams." />
```

And a chat or zone that withholds a read tool gives it back when its agent needs such a value:

```tsx
// before
<Agent.Zone builtins={["highlight"]}>
// after
<Agent.Zone builtins={["highlight", "readState", "readScreen"]}>
```

What `readState` and `readScreen` return is page content, so the first change after one asks the user first.

A chat where the user mentions a record now asks before the first change that follows. `AgentConfirm.set({ afterScreenRead: false })` turns that off together with the ask after `readScreen`.
