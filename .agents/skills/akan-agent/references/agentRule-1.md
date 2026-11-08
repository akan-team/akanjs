<!-- akan:generated -->

# Akan In-Page Agent Guideline

## Purpose
Use this when mounting `<Agent.Chat />`, publishing an `st.tool`, or deciding what an in-page agent may read and
drive. The always-loaded convention set carries the short version; this is the full contract.

## The Surface Is The Declaration

Every akan app can host a component-level agent that reads the rendered screen and drives it. **A component
declaration is the surface, exactly**: `st.tool` publishes one action, and `st.use` / `st.sel` / `st.ref` make one
store key readable while the reading component is mounted. Nothing is derived from a store class — declaring a
method on a `store(...)` gives an agent nothing at all, because a lever the screen does not offer the user is not
one an agent may pull in their place, and a module's whole vocabulary published at once was noise the model paid
for. `Load` scopes, the route, and the live keys complete the context. The React core is the `use-agentic` package;
apps and libs never import it directly (`no-import-external-library`) — everything reaches them through `st.*` and
`akanjs/ui`.

**Mounted is not published: on a CSR stack only the current page is.** The page kept under the current one for a
swipe back stays mounted and live, and its declarations stay registered, but its tools, resources, guides and
`st.use` keys are parked until it is current again — the agent sees the screen the user sees, never two. Each page
container renders `use-agentic`'s `<AgentActivity active>` for this; a parked registration shadows nothing, two
pages declaring one name never clash, and a registry kept outside the surface reads the same gate through
`useAgentGate()`, as the store's live keys do.

## Mounting The Chat
- **Mount `<Agent.Chat />` once in a layout.** That is the floating chat, the approval card, and the client-side
  loop. The default runner drives `runAgentTurn`, which the **framework serves on every app** — no lib to mount,
  `AKAN_AGENT=false` takes it off — and negotiates streaming via `accept`, so assistant text arrives as it is
  generated with zero app code. The endpoint is a stateless relay and **never executes tools**: every tool runs in
  the caller's own browser session, gated by guards and the approval card. Its guard is `AgentRelayAccess`, which
  **refuses every call until the app names a guard of its own** — the same answer `None` gives, with no boot
  warning. A product with accounts names it in its `option.ts`, `option.setAgentAccess(SignedIn)`, taking the same
  guard classes every endpoint takes (an array is ANDed, `null` clears what a library set); without one the chat
  cannot spend the LLM key. **The guard decides who, not what** — the browser writes the instructions, tools and
  transcript — so `option.setAgentRequestPolicy((request, { account, ip }) => request)` sees each turn after the
  guard, before the quota and the model (tool names as the page published them), and returns what is sent, or
  throws an `Err` (`agent.error.requestRefused`) to refuse it. With no policy set, a turn past
  `AgentRelayPolicy.defaultLimits` (5,000 messages, 512 tools, 256 context entries, 8M characters, 64 MiB of
  attachments) is refused with 413; a policy of the app's own keeps them by returning
  `AgentRelayPolicy.capped(request, limits)`, and `(request) => request` lifts them. An error that is not an `Err`
  reaches the chat as a generic failure and the server log in full, unless `AKAN_ERROR_DETAIL=1` or a development
  runtime (`akan start`, `NODE_ENV` `development` or `test`) shows its message.
  `persist` keeps the transcript across reloads (sessionStorage; `{ storage: "local" }` to outlive the tab),
  default off, and `shortcut={false}` gives the browser back the Cmd/Ctrl+L the launcher otherwise captures.
  **`persist` also takes a `SessionHistory` of the app's own** — `{ load, save, clear }` — which is how a
  transcript lives on a server instead of in web storage. All three may answer asynchronously; a `load` still in
  flight when the user sends the first message is **dropped, not merged**, because the conversation on screen is
  the one they are having — which makes **sending on mount a race the restore loses**, so an opening prompt waits
  for `session.isRestoring` to clear or goes into `defaultDraft` and lets the user send it. Saves are chained rather than fired per change, so a slow store cannot land an older
  transcript last. **Every session option on the chat — `runner`, `instructions`, `maxTurns`, `compact`,
  `builtins`, `persist`, `onCompact` — is ignored when an enclosing `Agent.Zone` or `AgentProvider` already holds
  a session**: the chat binds to that one, and the options belong to whoever built it.
  **A session the chat made ends when the chat unmounts** — nothing renders its approvals once it is gone, so a
  turn left running would drive a screen the user has navigated away from; a session handed down by an
  `AgentProvider` or an `Agent.Zone` belongs to whoever provided it.
- **The panel is customized in three widening steps, and most designs stop at the first.** Props first:
  `open` / `onOpenChange` drive it from the app's own control (`launcher={false}` then draws no launcher of its
  own), `launcherPlacement` / `hideLauncherBelow` place the launcher — which sits above the page's bottom chrome
  and under every menu and modal — `launcherClassName` / `panelClassName` reach one surface each where
  `className` reaches both, `intro`
  replaces the empty-state line — where starter questions go — and `header` adds controls beside the built-in
  clear and close. `chrome={false}` drops the header bar whole, for an `inline` chat inside a panel the app
  already titles, and `defaultDraft` opens the composer with text in it without sending it. A panel driven by a
  controlled `open` with **no** `onOpenChange` draws no close button at all rather than an inert one. Then the
  slots: `AgentLauncher`, `AgentSteps`, `AgentBubble`, `AgentComposer`, `AgentApproval`,
  `AgentQuestion`, `AgentToolCard`, `AgentQueued`, `AgentMenu`, `AgentMarkdown` and `AgentCode` each replace one part in `_overrides.tsx`, and
  `akanjs/ui` exports every default beside them (`DefaultBubble`, `DefaultComposer`, …) so a skin composes the
  one it is replacing. **`AgentSteps` is one agent turn** — the messages between the user message that opened it
  and the next one, with `isRunning` saying whether more are still coming — which is the grain a chat needs to
  fold a turn's steps into a `details` and stand its answer outside them. It is the one boundary a per-message
  slot cannot see, since neither message on either side of it knows it is at an edge. The default draws the turn's
  messages flat into a Fragment, so a chat that binds nothing renders exactly what it did before the slot existed. The attachment row is exported on its own as `AgentAttachments`, because a replaced
  `AgentBubble` that redraws it by hand forks the rule for which carrier is shown how — and then keeps whatever
  that rule was on the day it was copied. `AgentCode` is where a highlighter binds — the fence's language reaches it — and a
  replacement for `AgentBubble` carries its own `memo`, since the transcript re-renders on every delta. Only then
  `AgentChat`, which replaces the panel whole: it also replaces the slash commands, the compaction notice and the
  approval gate, so reach for it when the *layout* differs, not when the look does.
  A manifest reaches a layout-mounted chat like any other component: the override provider wraps the whole layout
  stack, root layouts included. `UiOverrideProvider` is also a public `akanjs/ui` export, for giving one mount site
  a different slot map than its route would.
- **The composer is a textarea**: Enter sends, Shift+Enter writes a newline, and it grows to a few lines before
  it scrolls. The vertical arrows still walk what was sent, but only from the first or last line — anywhere else
  the caret is the textarea's own. On a phone the panel is the whole screen (it is a card from `sm:` up) and it
  lifts above the on-screen keyboard, which only `visualViewport` reports.
  **Enter during a running turn parks the message and sends it the moment the turn ends** — the Queue button
  beside Stop does the same, and the placeholder says so. One slot, not a list: a second send joins the first on
  a new line, so the model is handed one user message. The card above the composer (`AgentQueued`) shows what is
  waiting with two ways out — ✎ takes it back into the composer, ahead of whatever was typed since, and ✕ drops it.
  **Stop hands a parked message back to the composer rather than opening the next turn with it**, so Stop means
  stop; `/new` drops it along with the conversation it was written for, the way it drops staged files. A `/prompt`
  parks like text and runs when its turn comes; the built-ins (`/new`, `/copy`, …) never park, and a question the
  agent is waiting on still takes the composer as its answer.
- **The LLM is configured in `option.ts`, never through the environment.** `option.setLlm({ apiKey, model, host })`
  — or `setLlm((options) => …)` to read the key out of the app's own env object, which is where a secret belongs —
  fills whichever adaptor holds `LlmAdaptorRole`, reaching it as the `llmOption` use. The settings are the role's
  rather than one provider's, so they survive a swap. **`OpenaiLlm` is the built-in default**, pointed at
  `https://api.openai.com/v1`; with no `apiKey` or no `model` the app still boots and the chat answers
  `llmUnavailable`. Swap providers the way middleware is applied:
  `option.applyAdaptor(LlmAdaptorRole, AnthropicLlm)`. An app may still write its own — an `adapt()` class in a
  `srvkit/` implementing `LlmAdaptor.chat(request, onDelta?)`, where ignoring `onDelta` still answers whole — and
  whatever settings it needs beyond `LlmOption` travel through the same `setLlm`, read back with
  `use<MyLlmOption>()` from an interface extending it.
- **Two adaptors ship, one per wire — a vendor is a host and a model name, not a protocol.** `OpenaiLlm` is the
  chat-completions dialect (`OpenaiDialect`) pointed at whatever `host` names, so OpenAI, DeepSeek, Groq,
  Together, OpenRouter, Ollama and a self-hosted vLLM are all one class and one `option.setLlm({ host, model })`.
  `AnthropicLlm` is the Messages API and declares `{ image: true, document: true }`; it is its own file rather
  than a branch, because the system prompt is a field and not a message, tool calls and results are content
  blocks, the results ride in a *user* turn, roles must alternate — so two wire turns that map to one role are
  merged — and `max_tokens` is required. **Both require `model`**: a default would age into a 404, and worse, it
  would decide the vision claim for the app.
- **`OpenaiLlm` claims vision for its default host and for nothing else.** OpenAI's own endpoint takes image
  parts, so that is what it answers with no `host` set. A `host` the app named is a gateway the class knows
  nothing about, and it stays text-only until `option.setLlm({ accepts })` says otherwise — handing bytes to a
  model that cannot decode them kills the whole turn on a 400, where text-only degrades them to a note the model
  can repeat back. A `host` naming OpenAI's own endpoint is the default host by hostname, not a gateway, and an
  app's own chat-completions adaptor claims through `OpenaiLlm.acceptsOf(llmOption)` instead of copying the rule —
  a copy that read "any host is a gateway" kept a vision model text-only for an app that spelled out
  `https://api.openai.com/v1`.
- **A refusal is `agent.error.llmRequestFailed`, and it names the host** — unless the prompt did not fit. It
  carries `{ provider, status }`, the hostname and the HTTP status; the provider's own sentence goes to the server
  log only, because it can quote an account id or part of a key and `Err` data reaches the browser.
  `LlmOverflow.refusal(host, status, reason)` builds it, and reads the one refusal a chat can undo — a prompt past
  the window, recognized from each provider's own sentence — as `agent.error.contextOverflow` with the `limit` it
  named, which the relay flags so the chat compacts and asks again. An adaptor an app wrote throws through the same function, so its refusals
  translate and recover the way the shipped ones do without a key in the framework's dictionary it cannot add.
- **`accepts` is answered per model, through `option.setLlm({ accepts })`.** An adaptor answers for an API and one
  API serves models that differ, so the override rides beside the `model` it is a fact about. It is not a table
  the framework keeps: a table is a claim about models that ship after it, and getting this wrong is the worst
  failure available — a provider handed bytes it cannot decode either refuses the turn or accepts it having seen
  nothing, and the model then answers confidently about a file it never read.
- **`contextWindow` is declared the same way: `option.setLlm({ contextWindow })`.** Every turn relays it with the
  answer ceiling the adaptor actually sends (`LlmAdaptor.limits` — `AnthropicLlm` always sends one, `OpenaiLlm`
  none), and the chat guards its window with it. It is not a table either; a model id is retired or renamed long
  before a table notices.
- **An adaptor answers `null` for "not configured" and *throws* for a refusal it can explain.** The two are
  different things to be told: collapsing both into `null`, the way the adapter convention otherwise reads, left a
  user reading `llmUnavailable` — "no model is configured" — about a conversation that had merely outgrown the
  context window. A thrown `Err` reaches the chat as its own text, so the reason the provider gave is what the
  user sees. It travels as the dictionary key plus the values that key interpolates, on both the JSON and the SSE
  path, and **`fetchRunner` resolves it against the dictionary one step before the transcript** — the endpoint has
  no language to resolve it in and the browser does, which is why the key was reaching the screen raw.

## Attachments And Speech
- **A file the user attaches rides the message, and nothing is stored.** The composer takes a paperclip, a drop and
  a paste; an image rides as bytes and a text file as text, which is all a browser reads with no dependency.
  Everything else is the app's own reader — `<Agent.Chat attach={…} />`, one `File` in, a `MessageAttachment` or
  `null` out — because extracting a PDF needs a parser and the framework carries attachments without depending on
  one. It runs ahead of the built-in, so it is also where an image is downscaled before it costs a megabyte of
  prompt. **What the provider cannot read is replaced by a note naming the file**, never dropped: an attachment the
  model never saw is one it answers about from the filename. An adaptor declares `accepts: { image, document }` and
  `AgentService.readable` degrades the rest, so a text-only provider needs no attachment code at all — DeepSeek
  declares none, which is why an image against the *default* provider is refused out loud while an extracted PDF
  works, `text` being readable by every model there is. Swap in `OpenaiLlm` or `AnthropicLlm` and the same image
  arrives as an image. `accepts.document` is one boolean over every non-image type, so an adaptor whose API has a
  block for only some of them — Anthropic's `document` is PDF and nothing else — names the rest in the text rather
  than dropping them, which is the wire's own rule applied at the one layer that knows which blocks exist. Persisting keeps each
  attachment's name, type, address and `ref` and drops only its content: web storage is a few megabytes, one
  screenshot fills a chunk of it, and a save that fails is silent — so keeping the bytes would quietly stop keeping
  the transcript, while an id is the handle a restored conversation has left to find the file with.
  **The ceilings are the message's, not the file's**: 4 MB per file, 8 MB and five files per message, and the same
  file twice is refused by name. The bytes ride inside one turn's JSON, so what a provider refuses is the sum —
  and a request that cannot be sent is one the user has to empty the composer to escape, which is why the refusal
  happens at the paperclip and names the file it dropped. All three are defaults rather than the law —
  `<Agent.Chat attachLimits={{ perFileBytes, perMessageBytes, perMessageCount }} />` — because what one request can
  carry belongs to the configured provider and not to the framework. The per-file one is measured on **what the
  reader produced**, not on the file that was picked: a reader that uploads and answers a `url` has already paid
  what the ceiling exists for, so refusing its 6 MB photo would refuse it for a cost it does not incur. Only the
  built-in path checks the source size, and there the file itself is the carrier.
- **An app may also build attachments itself and hand them to `session.send([{ role: "user", text, attachments }])`**,
  which is why `MessageAttachment` is exported from `akanjs/ui` — the composer's path is typed by the `AttachReader`
  callback, that one is not, and an object assembled with no nameable type is the one that gets a field wrong.
  Nothing downstream trusts the result: an attachment whose `mimeType` is not a string is noted like any other
  unreadable one, and its chip renders its name with no preview, because the host wrote the object and the declared
  type is a claim rather than a check. A field that arrives wrong costs that attachment, never the turn.
- **A `url` carrier is an address the *provider* fetches, and bytes beside it win.** A reader that uploads answers
  `{ url }` when its storage is publicly reachable, and `{ data }` — or both — when it is not: an attachment
  carrying both is read from its bytes and displayed from its address, so the chip draws a thumbnail and the model
  still gets the picture. That precedence exists because the other order fails the one way nothing reports: the
  default storage backend serves a path only the app can resolve, the adaptor would hand it over as written, and
  the model answers about a picture it never saw. Send a provider-reachable URL **alone** — paired with bytes it
  costs the provider hop whatever the bytes weigh, for a fetch the provider would have done itself.
- **An image type the provider has no block for is refused at the adaptor, not upstream.** `accepts.image` is one
  boolean, so `AgentService.readable` passes every `image/*` through, and the built-in composer reader base64s
  every `image/*` as well — an `AttachReader` answering `null` means "not mine" and falls through to it, so an app
  cannot gate one either. Both shipped vision adaptors therefore match an exact set (`jpeg`, `png`, `gif`, `webp`)
  and name the rest in the text. It matters because an unsupported type is not one unread attachment: it is a
  block the API refuses, so the **whole turn** dies on a vendor 400 — and `image/heic`, the iPhone camera default,
  is the likeliest one an app meets.
- **`MessageAttachment.ref` is the host's own handle on the file — carried, never read.** A file id, a storage key,
  whatever turns the attachment back into something a tool can be handed. The framework only moves it: the model is
  never shown one, and a tool the app publishes (`useFileFieldTool` below) is what spends it. Without it a host that
  stores its uploads keeps a map beside the transcript keyed on name and size — the same guess `Attachment.same`
  has to make, and the one that is wrong for two crops of one export. So when both sides carry a `ref`, it *is* the
  answer to "the same file twice", and the heuristic is what is left for when they do not.
- **A tool hands the model a file with `ToolReturn.attach(result, [attachment])`** (`akanjs/store`), which lands in
  `ToolCallResult.attachments` beside the value — a `result` reaches the model as JSON text, so a URL in it is read
  as letters and base64 as a wall of them. It takes a user attachment's shape and meets the same `accepts` check and
  type allow-list; Anthropic carries it inside the `tool_result`, the chat-completions dialect (whose `tool` message
  holds text alone) in one user message after the turn's tool messages. It is outside the 20,000-character ceiling
  and held to the 4 MB per-file one, and only the latest turn's ride as bytes: an earlier one becomes a note telling
  the model to call the tool again while the picture is on screen, since one picture costs over a thousand tokens on
  every turn it rides.
- **Speech is one engine contract and the framework's own policy.** `<Agent.Chat voice={engine} />` takes a
  `VoiceEngine` — `listen(handlers)` and `speak(sentence)`, both cancellable — and the chat decides everything
  else: a press-to-talk microphone whose transcript lands in the composer to be corrected, one utterance per
  press, sentence-at-a-time reading, barge-in on the next press or on Stop, and markdown stripped so `**bold**`
  is not pronounced. **A reply is read aloud only when the ask arrived by voice**, so a typed question never turns
  on the speakers — and it needs no wire field, because how a message was sent is the composer's own business.
  A question or an approval the loop parked on is read aloud under that same condition, because the loop stops
  there: a voice user who is never told about the card is a conversation that simply ends.
  The contract is a subscription rather than `listen(): Promise<string>` on purpose: a promise fits push-to-talk
  and nothing else, so hands-free could then only arrive as a breaking change. `useSpeech` in a util lib's
  `webkit/` is the engine — the browser's own recognition and synthesis. An app's WebView **has neither on
  Android or iOS** and `@akanjs/native` ships no speech plugin yet, so a `speech.plugin.ts` declares only the
  permission and its usage texts. An engine answering `available()` false renders no microphone at all,
  the same rule as publishing no tool for a control the screen does not draw.
- **Data the user points at rides the message too, as `references` — and its value is a snapshot.** A file is
  something they handed over; a reference is something they pointed at while asking, so it belongs in the same
  place and for the same reason. Screen context does not do this job: `ContextBlock`s are rebuilt from the screen
  every turn, so what was named three turns ago is simply not in the conversation any more. A `MessageReference`
  carries the host's own `refName`, the id, a label, an optional dotted `path` into the document, and the `value`
  those resolved to. **The value is never re-read on a later turn**, which is the point: re-reading rewrites what
  the person was looking at when they spoke, and the usual next thing the agent does is edit the very field it was
  pointed at — leaving a live reference showing the result with no record of what it was changed from.
  `refName`/`refId`/`path` travel so a tool can read the current value when the answer needs it, and
  `AgentService.referenced` folds the whole lot into the message text in one place, so every provider carries a
  reference without either adaptor knowing the word. **The value is masked on the way in and nowhere else**: masking
  needs the model class, which no wire carries, so the model a host names when it stages the reference is the whole
  of the decision about what leaves the browser — name the class that actually holds the field, because a `Light`
  one usually does not. **The ceiling is 20,000 characters per reference**, applied as it is staged and again on
  the server; a reference is bulkier than a tool result and outlives one, riding every later turn and being the last
  thing compaction folds. Persisting keeps the pointer and drops the value with a note saying so, which is a better
  restored state than an attachment can offer — the pointer is still live, so the answer is to read it again.
  Staging lives on the **session** (`stage` / `staged` / `unstage(key)` / `clearStaged()`), not on the composer where
  staged files live, because a reference comes from whichever component drew the data rather than from the paperclip;
  `unstage` is keyed on `refName/refId#path` because what orders a message's references is its text, not that list.
- **Two ways to point at data, and which one depends on who knows the value.** `<Agent.Chat reference={[…]} />`
  takes one `ReferenceSource` per kind of document — `refName`, a `type`, the app's own `search`, and a `resolve` —
  and the composer's `@` menu offers whole documents from them; the token is written the moment a row is picked and
  the value is staged when `resolve` lands, so a slow fetch never freezes the menu and one that fails leaves a
  pointer that reads as *go and read it*. For a field *inside* a document, the component drawing it calls
  `useAgentReference()` — it already holds the value, so there is no round trip, and it is the only thing that
  knows a rich-text field stored as `field(Any)` reads as a paragraph rather than as the editor document it is. The
  hook no-ops with a warning outside a session, the same call `AgentValue.publishable` makes: a card carrying a
  reference button must not cost a route its render.
- **The token in the draft is what carries a reference, and the chip only draws it.** Deleting
  `@[label](mention:refName/id#path)` by hand drops the reference exactly as removing the chip does — removing the
  chip removes the token — so the two can never disagree, and nothing re-derives a value from text somebody edited.
  A token pasted out of an earlier message travels as a pointer with a note, which is the same shape a restored
  conversation produces. Staged references are the **session's**, not the composer's, because `useAgentReference`
  is called from components the composer cannot see; writing the token is the composer's half, and `refer` warns
  rather than staging silently when no chat is mounted on that session — the case where a card sits outside the
  `<Agent.Zone>` its chat is inside.
- **The composer draws a pointer as the name it points at, never as the token.** Where `reference` sources are
  declared the input is a Lexical editor rather than a textarea, and each pointer is one atomic node — a backspace
  takes the whole thing rather than a character of a label that would then name nothing. Nothing above it changes:
  the node's text content *is* the `@[…](mention:…)` token, so the draft string the chat reads, the `@` query, the
  chips, the wire and the server's framing all see what they always saw, and every offset the chat hands over is
  an offset into that string. It is its own chunk behind the chat's, fetched only where a source was declared, and
  `mentions={false}` keeps the plain textarea — for an app that overrides `AgentComposer`, or one that would
  rather see the tokens it is sending. An override that draws its own textarea keeps working: it fills the
  `inputRef` it is handed, and the chat reads the caret off that when no editor filled `handleRef`.
- **`attach` and `voice` both carry functions, so a server layout cannot pass either.** A closure does not cross
  the RSC boundary — `non-scalar-props-restricted` says so on `page/**` — so an app that wants either mounts the
  chat from a small client component in the app's own `ui/` that calls the hook.
- **A dialog's close is the dialog's own dismissal, not a state flip.** `closeDialogIn<Ns>` (and `Dialog.Close`)
  run through whatever `Dialog.Modal` registered, so the agent takes the exact path the X button takes —
  `confirmClose` still prompts and `onCancel` still fires. A close that only set `open` to false would skip both,
  which is a different action wearing the same name.
