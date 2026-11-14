---
"akanjs": minor
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

What an agent turn carries beside the conversation reaches the model as marked data in a user turn, outside the system prompt.

- **A turn's `context` is no longer written into the system prompt.** `OpenaiDialect` and `AnthropicLlm` send it as a `<turn-context …>` block that ends the turn's last user-role content, after that turn's tool results: a text block on the Messages API, and on the chat-completions wire the end of the user message the turn closes on, or a user message of its own after tool messages. The block closes on a delimiter chosen so that its content cannot contain it, in any case or width or with characters that do not show between its letters. The delimiter is keyed with a secret of the process: the same text gets the same one in every request a process sends, and another process gives it another. The system prompt is the instructions alone, so it is the same text on every turn of a conversation and a provider's prefix cache keeps it.
- **A compaction summary is history in a user turn on both dialects.** It is sent as a `<conversation-summary …>` block. The chat-completions dialect used to send it with the system role, and the Messages API mapping with no fence. When the user's message follows the summary, the block opens that message, so neither dialect sends two user turns in a row.
- **`LlmContext`** (`akanjs/service`) is what an adaptor of the app's own calls: `LlmContext.of(request.context)` is the context text, empty when there is none, and `LlmContext.summary(text)` the summary block.
- **A context block can be marked `untrusted: true`** (`AgentWireContext`, and `ContextBlock` in the page) when it holds text someone other than the developer or the user may have written. Both dialects fence marked blocks apart from the app's own, in a `<page-content …>` block, the one a `readScreen` result arrives in. A turn that carries one counts as an untrusted read. In the page the first change after it asks the user first, as after `readScreen`. In `agentService.loop` the run is tainted from its first round: `approve` hears `tainted: true`, and with no `approve` a write is answered with the code `writeAfterPageText` and a sentence for the model, and the loop logs once per run that `approve` is what decides such a call. The run stores `tainted: true` on each assistant message it writes while tainted, so a resume and the next ask in that conversation keep the taint when the block is not passed again.
- **Text from a mentioned record is treated like text a tool read.** An `@` mention's reference reaches the model with its pointer, label, value and note together in one `<page-content …>` block under the "Referenced data" heading; before, only the value was fenced. The token in the user's message is sent as `@[pointer](mention:pointer)`, so the record's title is in that block only; the chat still draws the title. When the id or the path is not a token, as a slug is not, the token is sent as `@[ref-1a2b3c4d](mention:ref-1a2b3c4d)` and the block spells the pointer under that name. A message that carries a reference counts as an untrusted read: in `Agent.Chat` the first change after it shows the approval card a change after `readScreen` shows, and an `agentService.loop` run whose messages carry `references` is tainted from its first round. A loop's compaction digest names a pointed-at record by its pointer.
- **The page's default context keeps ids, enum members, numbers and booleans inline, and leaves free text to a read tool.**
  - A string rides inline only when it is one token: up to 40 letters, digits, `.`, `_` or `-`, of at most three words. A word ends at a separator or at a lower-to-upper case change, so `created-at-desc` and `createdAtDesc` pass and `archive-every-note-now` does not. More parts pass only as an id's: each hex, with a digit or eight characters long, as in a UUID. A run of over sixteen letters with no digit never passes. It used to ride inline up to 200 characters.
  - In the `state` block any other string is listed by key and type with no value.
  - The `route` block applies the rule to each path segment and path param, and keeps at most twelve words of each. A search param rides inline when a store declares its key with `search("key", …)` and its value is a token. Of the others at most four ride, key and value both tokens, so `?tab=settings&page=2&sort=created-at-desc` reads the same on a page whose stores declare none; the rest are left out, key and value. A page's typed `search` is read on the server and does not count as a declaration. What is left out reads `…` in the path, the block names the keys to read in `withheld` and the number of search params left out in `searchParamsWithheld`. `readState` answers `pathname`, `params` and `searchParams` whether or not a component subscribes them, as page content.
  - In the `screen` block a `Load` scope's label, which is its record's title, and the ids and labels of a list scope's `items` follow the rule; the block then says to read the scope with `readScreen`.
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

A store for `agentService.loop` messages must keep `tainted` on assistant messages too. Store each message `onMessage` hands over whole, as before; a store that picks fields adds this one. A loop that passes user messages with `references` and has no `approve` no longer writes: each write is answered with the code `writeAfterPageText`. Pass `approve`, or send the message without `references`. This lasts for the rest of the conversation, not for one run, because the stored messages keep the reference; a marked context block lasts as long through the mark on what the model said. Passing `untrusted` does not lift it.

A loop that passes messages with `references` and has an `approve` hears `tainted: true` on every call from that message on, in that run and in every later ask of the conversation. An approver that allows untainted calls by itself and holds tainted ones for a person will hold them all.

In a loop the model reads a mention in the user's words as `@[ticket/t1](mention:ticket/t1)`, or as `@[ref-1a2b3c4d](mention:ref-1a2b3c4d)` when the id or path is not a token, and finds the title only in that message's "Referenced data" block. A compaction summary names a mentioned record by its pointer and no longer by its title, so after a compaction the model reads the record again to name it. A prompt or a test that expected the title in the user's text looks in the block.

An app that relied on the model seeing a search param, a path param, a short store string or a list row's title in its context now has the model read it with `readState` or `readScreen`. The model is told which to call, so most apps change nothing. To keep a search param in the context whatever else the link carries, declare it in a store (`search("status", String, { default: "" })`); an undeclared one rides only as one of the first four whose key and value are tokens.

An id that is not a token is left out like other free text: a slug of more than three words (`my-first-blog-post`) or a mixed-case random id such as a nanoid (`V1StGXR8_Z5jdHi6B-myT`). A list scope's `items` then lists the other rows only, a list whose ids are all such lists none, and the block's `note` says to call `readScreen` with the scope's path, where every row is. A live store key holding such an id is listed with no value. A 24-character hex id, a UUID, a ULID and a number ride as before.

The URL an MCP App view reports to its host as model context no longer has the query string or the hash, and a path segment of free text reads `…`. A host prompt or a test that read a search param from that URL gets it from a tool the view publishes.

Two cases need an edit. Instructions that point at the context point at the tool instead:

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
