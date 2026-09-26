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

## Mounting The Chat
- **Mount `<Agent.Chat />` once in a layout.** That is the floating chat, the approval card, and the client-side
  loop. The default runner drives `runAgentTurn`, which the **framework serves on every app** — no lib to mount,
  `AKAN_AGENT=false` takes it off — and negotiates streaming via `accept`, so assistant text arrives as it is
  generated with zero app code. The endpoint is a stateless relay and **never executes tools**: every tool runs in
  the caller's own browser session, gated by guards and the approval card. Its guard is `AgentRelayAccess`, which
  **refuses every call until the app names a guard of its own** — the same answer `None` gives, with no boot
  warning. A product with accounts names it in its `option.ts`, `option.setAgentAccess(SignedIn)`, taking the same
  guard classes every endpoint takes (an array is ANDed, `null` clears what a library set); without one the chat
  cannot spend the LLM key.
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
  own), `launcherClassName` / `panelClassName` reach one surface each where `className` reaches both, `intro`
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
  can repeat back.
- **A refusal is `agent.error.llmRequestFailed`, and it names the host** — unless the prompt did not fit. The
  provider's own sentence rides in `reason` and the hostname in `provider`. `LlmOverflow.refusal(host, status,
  reason)` builds it, and reads the one refusal a chat can undo — a prompt past the window, recognized from each
  provider's own sentence — as `agent.error.contextOverflow` with the `limit` it named, which the relay flags so
  the chat compacts and asks again. An adaptor an app wrote throws through the same function, so its refusals
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
  `webkit/` is the engine — the browser's own recognition and synthesis on the web, the Capacitor plugins in a
  WebView, **which has neither on Android or iOS**, so a `speech.plugin.ts` declares the permission and
  the packages the native build needs. An engine answering `available()` false renders no microphone at all,
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

## Zones And Route Guidance
- **`<Agent.Zone id="comments">` runs a second agent over one section, in parallel with the root.** Everything
  mounted inside — `st.use` subscriptions, hook tools, Guides — belongs to that zone's own conversation *and*
  stays visible to the root agent: **zones are views, never walls**, so wrapping a section costs the root nothing.
  An `Agent.Chat` inside binds to the zone session automatically; a zone's `readScreen` reads only its own
  `data-agent-zone` container; guides follow the layout cascade (ancestors and own, never a sibling's). Zone
  membership is positional — there is no per-declaration zone key, so a lib component joins whatever zone the app
  mounts it in.
- **Two agents' turns run in parallel; their tool calls take turns.** Tool execution is serialized across the
  whole page, because `AgentAbort` and `AgentProgress` reach the running call through a module slot rather than a
  parameter — two calls in flight restore each other's slot and the second one's progress goes nowhere. Only the
  execution queues: a zone parked on an approval card holds nothing up, since waiting for the user sits outside
  the queue, and a call that is aborted releases it.
- **Everything a zone publishes is named `<id>.<name>`,** and that name is what instructions must use. A bare
  `createVideoProject` inside a zone naming its tool `videoProjectDraft.createVideoProject` is a tool that does
  not exist: the model calls it, the surface answers `Unknown tool`, and a turn is gone. Build the name from the
  id (``const zoneTool = (name) => `${ZONE}.${name}` ``) rather than writing it in two places, and read
  `Agent.Context`'s **Assemble** to see the published list — the names exist in neither file's source. The dot is
  the surface's own join and never reaches a provider: `AgentService` renames it to `__` on the wire, because
  every OpenAI-compatible and Anthropic function schema allows `[A-Za-z0-9_-]` only, up to 64 characters.
- **`builtins` decides which of the runtime's own tools a session gets** — all of them by default, `false` none,
  an array exactly the ones it names, on `Agent.Zone` and `Agent.Chat` alike. A zone whose conversation must stay
  on one screen takes `navigate` and `goBack` off it: `<Agent.Zone id="wizard" builtins={["readScreen",
  "readState"]}>`. The tools are **withheld, not discouraged** — a withheld name answers the same "unknown tool"
  a name that was never registered gets, so no prompt can talk the model past it, and the narrowing is the
  session's alone: the surface is shared, and the neighbouring zone still navigates. Shadowing a built-in by
  declaring a hook tool of the same name works at the root and **not inside a zone**, where the hook entry is
  registered under its scope-prefixed name and never collides — `builtins` is the zone's answer. A tool the screen
  declares under a built-in name is the screen's, not the runtime's, so `builtins={false}` leaves it standing.
- **`<Agent.History load save clear onCompact />` backs a zone's transcript from a leaf inside it**, instead of
  through `persist` on whoever builds the session. A function cannot cross the server/client boundary as a prop,
  so `persist={myStore}` makes every ancestor up to the zone a client component; mounted this way the only client
  module is the leaf, and `Agent.Zone` and the chat inside it stay server-assembled. Same shape as `Agent.Guide`,
  and it renders nothing. Restoring follows the session's one rule — it lands only while nothing has happened to
  the conversation yet — so mounting with the zone restores and mounting later saves from there on, with the
  store never asked for a transcript that would be discarded. `session.setHistory` / `setOnCompact` are the same
  thing for a session an app built itself — and are what a host calls when the store must outlive the view, since
  the component's store lives exactly as long as the component. A zone's own session dies with it either way; one
  the app handed in through `session` does not, and its saving stops when the `Agent.History` unmounts.
- **A zone can be handed a session instead of building one**: `<Agent.Zone session={mine} onSession={…}>`. The app
  then owns it, so unmounting the zone leaves it running — the opposite of a session the zone made, which it
  aborts. `onSession` fires either way, for a page that wants to send into the conversation from outside it.
- **`akanjs/ui` exports what a custom transport or transcript needs**, so no app reaches into the package's
  internals: `httpRunner` (the wire the default runner speaks — point it at an endpoint of the app's own and
  streaming is kept), `fetchRunner` (the default, to wrap), `AgentSession`, `AgentProvider`, and the
  `AgentRunner` / `RunnerRequest` / `RunnerEvent` / `ChatMessage` / `SessionHistory` / `PublishedTool` /
  `ContextBlock` types. `onCompact(replaced, summary)` reports a compaction's cut, for a host that keeps a
  server-side summary and has to move its own watermark to the same place.
- **Route guidance is `<Agent.Guide instructions="..." />`** rendered from a `_layout.tsx` or a page — the render
  tree is the cascade: nested Guides concatenate outer-to-inner and navigating away withdraws them. It is a
  component, not a pageConfig field. Module `*.abstract.md` files are developer docs and are never served to the
  agent.

## Publishing A Tool
- **Declare the tool beside the control that already does it.**
  `st.tool("x").desc("…").arg("id", ID).opt("force", Boolean).exec(fn)` publishes one action and returns the
  callable to hand to `onClick` — one handler for the person and the agent, which is the point: a button wired to
  an inline arrow can be clicked by a person and by nobody else. `.desc()` is required and comes first, `.arg()`
  is an argument the caller must pass and `.opt()` one it may leave out (the `exec` parameter is then `| null`),
  and `.exec()` is the only hook, so the chain completes in one unconditional statement and the callable carries
  `data-akan-action` like a store setter does. A `remove*` name defaults to a confirm gate. Reach a store action
  from the body — `.exec((id) => st.do.removeX(id))` — which is how an agent gets CRUD; `st.do` on its own
  reaches nobody.
- **`.card()` is the other way the chain ends, for an answer that is the user's to give.** Where `.exec()` runs a
  function, `.card(({ submit, cancel }, ...args) => <Form …/>)` parks the call in the chat and renders the app's own
  component there; what `submit` is handed is what the model reads back, and `cancel` is the refusal it reads
  instead. A name and a phone number, a date somebody has to look up, a signature — a model that fills those in
  has answered its own question, and every other shape of "ask the user" is `askUser`. The declared arguments are
  checked **before** the card is parked, so a bad one reaches the model as a refusal rather than throwing inside
  the render; `confirm` is not read at all, because the card in front of the user is already the asking. The frame
  draws its own way out even when the card does not, and the turn is never parked on something with no exit.
- **The second argument is how the call behaves, never what it is.** `{ settle, confirm, guard }`:
  `settle: false` marks a read that returns what is already there and skips the wait; every other tool is waited
  out before its effect on the screen is reported, because a write may still be landing when `exec` resolves. A
  tool that reads and one that writes are otherwise the same declaration — there is no taxonomy field, because
  nothing downstream would read one.
- **A falsy name declares the tool without publishing it** — the callable still drives the click a person makes,
  and the agent never learns the tool exists. That is the only way a conditional surface stays legal, because
  `.exec()` is a hook and the declaration can never be skipped: withhold the name, not the call. `st.useState`
  and `st.expose` take a falsy name the same way, and an unpublished callable carries no `data-akan-action` —
  that attribute names a tool an agent can reach. **Publish a tool only where the screen already renders the
  control**: a lever no one can pull by hand is not one to hand an agent, and every published tool is paid for in
  every turn's prompt. The mirror of the same rule is why the control gets a tool at all.
- **An `enumOf` class is a complete argument type on its own**: `.arg("mode", TaskStatus)` publishes the values as
  the argument's `enum`, refuses anything off them by name at call time, and narrows the `.exec` parameter to the
  value union — nothing else to write, and the scalar (`string` / `integer` / `number`) comes from the values.
  **A value set the *render* decides takes `.arg(name, type, { oneOf })`** (or `.opt`) instead, because `enumOf` registers
  globally and a component cannot build one per render: pass the list it has — a slice's sort keys, the options a
  prop carried — and it is published and enforced the same way. Neither reaches a set that fills in *after* the
  first render, since a declaration is mount-static; put that in the tool's `guard`, which is re-read per call and
  can name the current values in its refusal. **One array level of either is describable too** —
  `.arg("bodies", [String])`, `.opt("modes", [TaskStatus])` — and `oneOf` then narrows the elements rather than the
  list. It is the schema `fill<Model>Form` already builds for an array field, so the same shape reaching an agent
  through a form and not through a component tool was an oversight: a tool that could not say "a list of these"
  said it in prose, and the app then owned a parser for the format it invented. A second level is not describable.
  **An argument type nothing can describe — a model class, `Any`, a
  `Map` — withdraws the whole tool and says so on the console**, naming the tool, the argument and the type; the
  callable still drives the click a person makes. It does not throw: a tool schema is built during render, and an
  agent-tooling mistake that aborted the render would cost the route its server rendering. `st.useState`'s `set`
  degrades the same way, to read-only.
- **A component that renders once per row never closes over its row's id — it takes the id as an argument.** A
  tool that captured its own row would be fifty registrations of one name, forty-nine of them shadowed, and the
  survivor would remove whichever row happened to mount last. Take the id instead — `removeTask(taskId)`, never
  fifty `removeTask` — and every row's registration is then interchangeable, so a row component may publish after
  all. **Nothing is written to say so: the description says it.** Fifty rows of one component produce one name
  and one `.desc()`, which is the same declaration fifty times over and warns about nothing; a second description
  arriving under a name already taken is two components that happened to pick one word, and that warns. So the
  rule an app follows is about the sentence, not about a flag — two tools that would do different things
  (a different `modal`, a different redirect) cannot honestly share a description, and that pair wants a
  `namespace` or nothing at all. The ids come from the `<slice>.items` resource `Load.Units` and
  `Data.ListContainer` already expose.

## What `akanjs/ui` Publishes For You
- **`akanjs/ui` publishes its own controls, so an app writes nothing for them.** `Data.ListContainer` (and every
  `Model.AdminPanel`) publishes its toolbar and its row verbs; `Model.NewWrapper` (so `Model.New` too) publishes
  `new<Model>`; `Load.Units`, `Load.Pagination` and `Data.Pagination` publish `setPageOf<Model>`; `Layout.Sider`,
  `System.SelectLanguage`, `Link.Back` and `System.ThemeToggle` publish the shell. **A component that can render
  twice on one screen takes a `namespace` prop and publishes nothing without it** — `Tab`, `Dialog`,
  `ScreenNavigator`, `Dropdown`. Pass one (`<Tab namespace="detail">`) and the tool becomes `switchTabInDetail`;
  leave it off and that tab is invisible to the agent, because two tabs answering to `switchTab` would mean the
  first to mount loses. A named `Dropdown` publishes `openDropdownIn<Ns>` / `closeDropdownIn<Ns>` and the state
  `dropdownIn<Ns>`, and its trigger annotates whichever of the two its next click performs. `Model.NewWrapper`
  takes the same prop but publishes without one, because its slice already names it — a second create trigger for
  the same slice, opening a form seeded differently, is what needs the suffix.
- **The `Model.*` row wrappers publish their verb, taking the id.** `Model.EditWrapper`, `Model.ViewWrapper`,
  `Model.RemoveWrapper` and `Model.Remove` publish `edit<Model>` / `view<Model>` / `remove<Model>` with a
  `modelId` argument, so a list built from `Load.Units` and an app's own `Unit` reaches the same verbs an
  `AdminPanel` does. `Model.SureToRemove` publishes the same — except under `typeNameToRemove`, where it
  publishes nothing: that gate makes a person retype the model's name, an approval card is one click, and
  offering the lever at a friction the screen does not have is not the same control.
- **A dropdown's menu is mounted from the first render and hidden while closed** — the deliberate opposite of the
  modal rule below, because a menu is one click away rather than a surface of its own. A tool is declared by a
  mount effect, so an unmounted menu is one whose row verbs and field setters do not exist yet: an agent asked for
  one finds nothing, and no catalogue entry hints that opening the menu would help. `readScreen` still skips
  hidden content, so the items themselves are read only after `openDropdownIn<Ns>` — what a closed menu publishes
  is its tools, not its text. The cost is that `content` renders on page load, so a heavy panel belongs behind a
  `Dialog` instead.
- **A modal publishes its verbs while it is open, and only then.** `Model.EditModal` publishes `submit<Model>`
  and `cancelEditOf<Model>`, `Model.ViewModal` publishes `closeViewOf<Model>`, and `Model.ViewEditModal`
  publishes `edit<Model>` / `submit<Model>` / `closeViewOf<Model>` — each from a subtree that mounts with the
  open modal, never from the component that merely holds it. That is what makes a list legal: `Data.CardList`
  renders one editor per row, and at most one of them is ever open, so one name is registered rather than fifty.
  It also means the verb is absent from the catalogue while nothing is open, which is honest — and costs the
  agent nothing, because the catalogue is re-read on the turn that follows the tool call that opened the form.

## Forms
- **A form control publishes its own setter, and reading a form publishes one tool that fills several at once.**
  Both are free: an app writes no `st.tool` for a form. A `Field.*` / `Input.*` / `Select` / `Switch` handed
  `onChange={st.do.setTitleOnTask}` **by reference** publishes `setTitleOnTask` while it is on screen — the same
  reference that earns `data-akan-action`, so the tool and the person press one function and an inline arrow
  still publishes nothing. `st.use.taskForm()` adds `fillTaskForm(patch)`, which takes several fields in one call
  and is the only way to reach a list, a map, or an embedded object, whose rows are written through
  `writeOnTask(path, value)` and can carry no annotation. It is a patch: a field left out keeps its value.
  `fillTaskForm` refuses a plain field whose control is not on screen and names the ones that are; a composite it
  cannot see is let through, which is the one place an agent reaches a field the screen may not draw. Never a
  relation (picked or uploaded, not typed), a base document field, or a `hidden`/`secret` one at any depth —
  their reads are masked and a writer would be the door around that. `st.use.taskForm({ agent: false })`
  withholds the patch tool; an inline arrow withholds a control's own.
  **The patch writes each plain field through that control's own published tool, not the setter underneath it** —
  which is what carries the control's `transform`, so a field cannot normalize one way for `setPhoneOnBizAccount`
  and another way for `fillBizAccountForm`. Only a composite, having no control, dispatches its setter directly.
  The patch tool's entry is a pure function of the model, so a form put on screen by a shell that subscribes it
  (`Model.EditModal`) *and* by the `Template` inside it registers the same name with the same description twice
  over — one declaration, not a clash. Neither has to suppress the other, and neither is asked to.
- **A `disabled` control publishes nothing, so the agent never gets a lever the person cannot pull.** Every value
  control reads it — `Field.*`, `Input.*`, `Select`, `Switch`, and the four relation pickers — and disabling a
  mounted control withdraws its tool for as long as it stays disabled. One gate covers both writers: with no
  control published, `fill<Model>Form`'s guard refuses that field too. `readScreen` says `(disabled)` beside the
  control, from the native attribute or `aria-disabled`, so a refusal is something the agent could have read first
  rather than a surprise. This is the same rule as publishing only where the screen renders the control, applied to
  a control the screen renders but withholds.
- **Whatever the wrapper was for, there is a place to put it that is not the wrapper.** An inline arrow is the one
  shape that publishes nothing, so each reason for writing one has its own home, and reaching for that home is what
  keeps the field reachable:
  - *normalize* — `(v) => set(formatPhone(v))` becomes the control's own `transform` prop, which every text and
    number `Field.*` already takes (`Field.Phone` defaults it to `formatPhone`). `onChange` stays a reference, and
    **`transform` runs on the agent's write too**, by both paths — the field's own tool and `fill<Model>Form`,
    which goes through the control to get it — otherwise a person would store `010-1234-5678` and an agent the raw
    digits. It normalizes one scalar, so an array control applies it per element and a cleared nullable field stays
    null. It is the *control's* rule, though: a rule that must hold however the field is written — including a
    composite path or a base-document write — belongs in `_postSet<Field>` below.
  - *multi-write* — `(v) => { set(v); other(v); }` becomes a **`_postSet<Field>` method on the store**, and the
    control keeps handing over the generated setter by reference. It runs right after the field is written, so it
    reads the new value, and it reaches every other generated action with `this.` —
    `_postSetToBiz(toBiz) { if (toBiz) this.addSendEmailsOnEstSheet(toBiz.sendEmails ?? []); }`. Nothing about the
    control changes, so `data-akan-action` **and** `data-akan-state` both survive, and the rule now fires for every
    writer — the person, the agent, `fill<Model>Form` — which is what a rule about a field should do.
    **A generated action cannot be overridden, so do not try.** They all come from mapped types, and a mapped type
    produces *properties*: a subclass method of the same name is `TS2425`, optional or not, and the two shapes
    TypeScript does allow — a class field and a getter — are both skipped by `StoreRegistry.register`, which only
    collects prototype descriptors holding a function. There is no legal middle, which is exactly why the hook
    carries a leading `_` and no model suffix: a name no mapped type can produce is the only name a subclass may
    declare. It cannot be typed either, for the same reason, so a misspelled field is named on the console at
    registration instead. Calling a generated action *from* a custom one is fine and always was — `this.setXOnY(v)`
    typechecks anywhere.
  - *nested path* — `(v) => writeOnTask("payments.3.name", v)` has no home and needs none: an embedded row is
    unannotatable by design, and an agent reaches it through `fillTaskForm`, which waves composites through.

  `no-unpublished-form-setter.grit` errors on the pure-forwarding shape only, because every other one has a
  legitimate reading. **`akan quality scan` counts them all** (`akan.agent.unpublished-form-setter`, one warning per
  file): the lint rule is the per-line enforcement, the scan is the inventory of fields this screen writes but
  cannot be asked to write.
- **A relation reaches an agent from its picker, not from the form patch.** `fillTaskForm` publishes no schema for
  one and is right not to: the form holds the whole related document, so an id would need a lookup the store does
  not do. The picker is where that lookup lives, so `Field.Parent` / `Field.Children` publish the pair themselves —
  `load<Field>OptionsOn<Model>`, which loads the slice and returns `[{ id, label }]`, and the field's own
  `set<Field>On<Model>` taking `<field>Id` / `<field>Ids`. Listing is its own tool because loading is its own step
  for a person too: the options arrive when the dropdown opens, and an agent never opens it. `Field.ParentId` /
  `Field.ChildrenId` need none of that — the id *is* the value, so the ordinary setter describes it. All four still
  require the setter **by reference**, and a `disabled` picker publishes nothing.
- **An upload control reaches an agent the same way, through `useFileFieldTool`.** The clause after "picked **or
  uploaded**" has its own hook: the control hands `read` and `label` and gets `load<Field>OptionsOn<Model>` — the
  same name the relation picker publishes, because a form draws both side by side and a model that learned the
  name on one field spells it the same on the next — plus the field's own `set<Field>On<Model>` taking
  `<field>Id` / `<field>Ids`, with `add`/`sub` besides on an array field. **`read` omitted publishes nothing**: a
  shared `Field.Img` forwards an optional prop, and a call site handing it none has no candidates and must not
  grow a tool that refuses every id. `read` is the control's rather than the framework's because the ids are the
  host's — a conversation carries `MessageAttachment.ref`s, and only whoever set them can turn one back into the
  model a form field holds. akanjs draws no upload control itself, so this is the hook a lib's `Field.Img` /
  `Field.Imgs` calls, exactly as `Field.Relation` calls the relation one.
- **`add`/`sub` on a file field are the only way in, not the weaker way.** For every other list of ids they are a
  convenience the framework declines to pay a tool for — `useFieldTool` publishes them for embedded rows only, and
  the relation picker not at all, because a picker's `read` is the whole resolvable set so rewriting the array is
  always expressible. An upload control's `read` is what *this conversation* brought, and the field may already
  hold files that predate it: naming the array whole drops those, since the ids that would keep them are ids the
  guard has never heard of. **`max` / `min` are passed, not derived** — `ConstantField` carries `arrDepth`, which
  says the value is a list and not how long a legal one is — and they reach the tool's *description* as well as
  its guard, because a limit an agent can only learn by tripping the server's `Err` is the round trip the listing
  tool exists to spare it. Two call sites rendering one field with different caps describe one name two ways, and
  the surface warns, which is the right answer: a field has one cap. For the same reason the unknown-id refusal
  **names the boundary rather than the absence** on a list: an id already on the field is real, on screen, and in
  the form the agent just read, so "no such file" reads as the form being wrong instead of the verb — it says the
  id is not among what is *offered*, and points at `sub<Field>On<Model>`, which does cover it.
- **An array of embedded rows also publishes `add<Field>On<Model>` and `sub<Field>On<Model>`** — append, and
  remove-by-position — beside the whole-array setter. Not new authority: the setter can already produce any array
  those two can, so they are strictly weaker. What they add is that neither can touch a row it was not given, and
  that is the point: writing the whole array means echoing every row the agent is *not* changing, `checked`
  validates types and not values, so one mistyped row nobody asked about is written silently. Both take a list and
  act atomically, because removing positions one call at a time would shift the ones not yet removed. **Only an
  embedded-row array gets them** — an array of primitives or of relation ids has nothing to retype wrong, its
  values *are* the payload, so it keeps one setter and pays for no extra tools. `add` appends and publishes no
  insert position, matching the `+` a person presses; `addOrSub` is never published, since it matches by `indexOf`
  and would compare rows by reference. Editing a row in place stays `fill<Model>Form`'s job.
- **A list the person can drag also publishes `move<Field>On<Model>(from, to)`**, and `DraggableList` is a form
  control like any other: handed the generated setter by reference it publishes that field, so an app that renders
  its own rows with `DraggableList` writes no `st.tool`. The reorder tool exists for the same reason `add`/`sub` do
  — the drag is the lever the screen offers and it changes no entry's content, so moving one row should not mean
  retyping the nine beside it. No store action answers to it: reordering *is* a whole-array write, so the tool
  splices the live entries and hands them to the setter the drag hands them to, `transform` deliberately not
  applied, since the values are stored already and dragging normalizes nothing. It comes from the control saying
  it sorts, not from the field, so a plain `Field.List` publishes no reorder and a scalar field never gets one.
  **A component that composes `DraggableList` and already published the field hands the inner list a wrapper** —
  the two would otherwise register one name twice, and the outer one is the one holding `transform`. That is what
  `Field.TextList` does, and the only place an inline arrow is the right answer rather than a bug.

## Reading State
- **Reading is per key, not per store.** `st.expose(name, Type).desc("…").value(v)` publishes a derived value and
  `st.useState(name, Type, { set: true }).desc("…").init(initial)` local state, read-only without `set`. Both
  end in a hook, so a conditional surface withholds the name rather than skipping the chain. A subscribed store key is listed in
  the state context block by name and pulled with `readState(key)`, masked by the model that key declares — while
  a key the screen does not read stays unreadable even when a sibling key of the same store is live. **There is no
  store-level exposure declaration**: a store class says nothing about agents, and `st.use.x({ agent: false })` is
  how the component that subscribes a value keeps it off the surface. Base-store plumbing does the same at the
  call site — `st.use.path({ agent: false })`, `st.use.tryJwt({ agent: false })` — so routing and the caller's
  credential stay off the surface unless a component opts a key in, as ThemeToggle does for `theme`.
- **Model-facing text is English, always** — every `.desc()`, `instructions`, Guide text. The `l()` rule covers
  strings a *user* reads: Chat's own buttons go through `l("base.*")`, the model's text never does.
- **The declared type is the mask.** `st.expose`/`st.useState` take a scalar, an enum, a model class, a one-level
  array of any of those, or `Any`. A model class both typechecks what the component hands over — the state object,
  so a hydrated document and a plain copy of one are equally accepted — and strips the model's `hidden`, `secret`,
  and `visual` fields on the way out, by the model that was *named* rather than by whatever class the value still
  happens to carry. A `Date` leaves as an ISO string. `Any` is the escape hatch and passes the value untouched, so
  a payload nobody modeled stays publishable and its owner keeps the tokens it costs. A type nothing can read (a
  `Map`, an `Upload`, a class that is not a model) is reported on the console and left unpublished, never thrown —
  the same degradation an undescribable `.arg` gets. `.value()` also takes a thunk, which is read when the agent
  reads: that is the shape for a value assembled out of a ref the children fill in after the render.
- **A field the page needs and an agent does not is `field.visual`.** `abstractData: field.visual(String)` — a blur
  placeholder, a rendered HTML body, a serialized geometry: real data the screen renders, and hundreds of tokens per
  record no question is answered from. It is stripped by `mask`, so it leaves every agent-facing read and every MCP
  result, and it is left alone by `resolveReturn`, so the browser still receives it. Unlike `hidden`/`secret` it is
  cost rather than secrecy: nothing is *refused* over one, and it stays an ordinary stored `property`, so
  persistence, search, forms and the page response are untouched. Reach for it whenever a field is bulky and
  useless to a model — that is cheaper than every tool learning to avoid it.

## Slash Commands And The Transcript
- **The `/` menu is the chat's own.** An app's prompts are `page().prompt()` declarations served over MCP to
  external agents; a browser chat lists none of them, so the menu holds the six built-in commands and nothing else.
- **The chat answers six slash commands of its own**: `/new` (`/clear`), `/retry`, `/compact`, `/copy`, `/help` and
  `/tools`. An app writes none of them and cannot add one — a workflow a person invokes by name belongs to MCP, as
  a `page().prompt()`, where it is guarded by the page it opens. `/new` and `/copy` are dispatched *before* the is-a-turn-running check **and before the question card takes the
  composer**, because mid-turn is exactly when they are reached for and a question the agent asked is the middle
  of a turn like any other — answered as text, `/new` would have reached the model as the user's decision.
  `/new` therefore aborts the turn it is clearing and waits for it to wind down, since the loop clears its own
  running flag a microtask later and a transcript emptied before that lands is one the dying turn appends onto.
- **A command's output is a `local` message: rendered in the transcript, withheld from the wire.** The transcript
  *is* the model's history, so `/help` text appended plainly would come back next turn as something the assistant
  believes it said. `session.note(text)` is the only way to write one, `session.report(error)` stays what a
  host-side *failure* lands in, and `local` messages are left out of a `/copy` export too — they are the chat
  talking to itself. Their text is user-facing, so it goes through `l("base.*")` like every other chat string.
- **`/copy` exists because nothing else keeps the transcript.** The relay is stateless and the conversation lives
  only in that browser, so an export is the one path a wrong answer has to whoever could fix it — which is why it
  carries the route and the timestamp. `/retry` replays only the trailing user message, leaving anything before it
  in place, so a prompt's own preamble is not sent twice.
- **A long conversation summarizes itself, because nothing else is keeping it inside the model's window.** The
  loop runs in the browser and the relay holds no session, so an uncompacted chat grows until the provider
  refuses the whole request — a refusal, never a shorter answer, which is why compaction runs *before* the turn
  that would have overflowed. **Two triggers, each before every assistant turn.** `compact.at` is a ceiling on
  cost: past that many estimated transcript tokens (four characters to a token, over the JSON the turn posts —
  except an inlined picture, counted at the ~1,600 tokens a provider bills for its pixels rather than its base64;
  24k by default) the history compacts, because the relay resends the whole transcript every turn and the app
  pays for each one. The **window guard** compacts once the prompt nears the window the server reports —
  `window − answer ceiling (8,192 when unreported) − compact.buffer (13,000, the margin Claude Code leaves)` —
  measured by the provider's own count of the last turn (`done.usage`, kept on that assistant message) plus the
  four-character estimate for what arrived since, so a Korean transcript the character rule reads as small is
  still caught. The window comes from `option.setLlm({ contextWindow })` or from the first refusal that names it;
  with neither, only the ceiling runs. **A refusal for length is answered once**: a relay flags it `overflow` on
  the wire, and the session compacts and sends the same turn again, and a second refusal in the same send fails
  with `agent.error.contextOverflow`. Either way the history above the last `keep` messages
  becomes one message standing in for it, flagged `summary` on the wire — `<Agent.Chat compact={{ at, keep, buffer }} />`
  tunes it, `{ at: Infinity }` leaves only the window guard, `{ at: 0 }` turns off the ceiling, the guard and the recovery alike, and `/compact` does
  the same on demand keeping nothing. The header draws the estimate against whichever trigger is nearer.
  **The cut never lands on a `tool` message**: the kept half may not open with a result whose call was summarized
  away, a shape every provider dialect rejects. A user message is preferred where the tail holds one — everything
  above it is settled — but one assistant turn that ran ten tools has none, and that is the transcript that
  outgrows the window, so a cut there opens on the assistant message instead. The summarizing
  turn carries no tools and no screen context — it summarizes the conversation, it does not act on it — and it is
  fed a *bounded* digest rather than the transcript itself, since the transcript being summarized is the one that
  no longer fits. The previous summary is the exception: it rides the digest whole, under its own label and outside
  the bound, because it is the only record of what was compacted before it. A summary that cannot be produced leaves the transcript alone, the turn goes out as it would
  have, and the next one asks again — a summarizer that was momentarily unreachable says nothing about whether
  this transcript can shrink. One that *landed* and shrank nothing does, so that one is not retried until another
  threshold's worth has been added. On the
  wire a summary wears the user's role because the wire has no other, so a provider mapping frames it as a system
  message and `/retry` steps over it — replaying it would send the notes back as a question. **While a summary is
  being written the transcript says so** (`session.isCompacting`, distinct from `isRunning`, which an
  auto-compaction runs inside): that turn takes as long as any other and answers nothing the user asked, so a chat
  that only shows the running dot reads as a question being ignored.
- **The transcript shows what each turn costs, because nothing else can.** The header carries the whole
  conversation's estimated tokens (`session.tokens`), and every settled tool row carries its own and **opens onto
  the value the model was handed** — a tool result is the one part of a transcript neither the user nor the app
  author ever sees, being the app's own return value. A window that filled after four messages is explained by
  *which* row cost a million tokens and by nothing else, so that is the question the row answers in one click.
- **A stopped turn answers the calls it never ran, because an unanswered call ends the conversation.** Every
  provider dialect refuses an assistant message whose `tool_calls` have no results — on that turn and on every
  later one — so Stop landing between a call and its result would leave a transcript nothing can be sent from,
  with no way out but `/new`. `Transcript.sanitize` holds the invariant in one place and runs where a transcript
  is assembled rather than where each hole is made: the turn's own request, a transcript restored from storage,
  and a stored transcript capped to its newest messages, whose window can start mid-pair. A call the loop never
  reached is *answered* rather than erased — a model told the call was stopped asks again, where one shown no
  call at all answers as if it had the result.
- **A turn that failed says so on the wire.** `error` is a field only this wire has, so a provider mapping reads
  `text` and drops it; `AgentService.explained` folds it into the text before any adaptor sees it, because an
  assistant turn that says nothing is one the model repeats.
- **↑ and ↓ in the composer walk what was sent**, seeded from the transcript so a persisted chat does not lose
  only what was just typed. A single-line input has nothing of its own on the vertical arrows, and the
  half-written draft they were walked away from comes back at the bottom of the walk. **The `/` menu takes those
  keys while it is open** — it is the thing on screen the arrows point at — with Enter picking the highlighted
  row, Tab completing its name, and Escape closing the menu and then, pressed again, the panel.

## Built-In Tools
- The framework publishes five built-ins on every store surface: `navigate` (internal paths only, the same router
  `Link` rides), `goBack` (this session's history — global, because history is not a control a page owns and a page
  that draws no back link is not one you may not leave — a screen that must not be left withholds them with `builtins`,
  not with prose), `readScreen` (the rendered DOM as compact text — headings, links, control values, and `(disabled)`
  on a control or button that has it; the chat's own UI is skipped via `data-agent-ui`, and a password value is never
  read), `readState(key)` (one masked store key — a key that is unknown or that this screen does not read is refused
  *with the keys it can* read, the way `readScreen` names its sections), and `highlight(target)`. Declaring a hook tool
  under one of those names shadows the built-in, so reuse them only to mean that. **There is no general-purpose wait**:
  a built-in one was reachable on every screen and a model spent it on whatever key it liked, parking turns nobody
  asked to park. Waiting belongs to the screen that knows what is worth waiting for — publish an `st.tool` beside the
  control that starts the work, and let it await the work.
- **A tool that changes the screen waits for the screen before it answers.** `router.push` returns while the RSC
  payload is still in flight and a store action that fires `void fetch.*` commits a tick later, so `navigate`
  awaits `ScreenSettle.wait()` — DOM quiescence, bounded, because the client router hands its promise to nobody —
  and the session awaits it after every tool that did not declare `settle: false` before taking the change report.
  Without it the report describes the moment before the change landed and the `readScreen` that follows reads the
  page the user left. The reading built-ins (`readScreen`, `readState`, `highlight`) declare it, because a wait
  costs 120ms of quiet at the very least and they change nothing a resource holds.
  New tools and state from a fresh route are still only listed from the next turn: the catalogue is snapshotted
  when the turn starts.
- **A tool that waits for its own work costs no model turns; one that returns early costs one round trip per
  look.** The session awaits `run`, so a `.exec` that awaits the store action finishing the job simply makes the
  turn take that long — and the change report that follows carries whatever landed, so the model needs no second
  call to read the result. A fire-and-forget tool leaves the agent to poll instead, which burns the whole
  `maxTurns` budget in seconds on a job measured in minutes. Say so in the `desc` ("takes about two minutes; do
  not poll while it runs") and, for a route full of slow work, in an `Agent.Guide`.
- **A wait is a screen's own tool, declared where the slow work is.** For the job a tool cannot await — one
  started in an earlier turn, or by a person clicking the button — publish an `st.tool` that parks on the thing
  *that* screen knows about, and say in its `desc` what it waits for and roughly how long. A general built-in was
  tried and removed: reachable on every screen with no idea what any key means, a model spent it on whatever key
  looked promising and parked turns nobody asked to park. The screen that starts the work is the only place that
  knows what finishing looks like, and a tool declared there is also one the agent cannot reach on a screen where
  waiting makes no sense. Honour `AgentAbort.current` in the body and report with `AgentProgress.report`, so Stop
  ends the wait and the row says how it is going.
- **Stop reaches a tool that is still running.** The session races every call against its abort signal, so a
  two-minute tool does not hold the loop for two minutes after the user presses Stop. The signal itself arrives
  through `AgentAbort.current` — the same module slot `AgentProgress` is — and honouring it is optional, since the
  race lands whatever the tool does; what it buys is the tool's own cleanup, a timer or a poll loop that would
  otherwise run out with nobody left to answer. A tool that ignores it is left running rather than cancelled: the
  work is usually a job a server is already doing.
- **`readScreen` takes a `section`, and `highlight` a `target`.** Both resolve a name the agent has already seen —
  a `data-akan-action` / `data-akan-state` annotation, an `Agent.Zone` or `useScreenScope` container
  (`data-agent-scope`, which `Load.Units` / `Load.View` / `Data.ListContainer` put on the container they render),
  an element id, or **a heading by its own text**, matched on letters and digits so the slug an agent writes for a
  heading it read resolves. That tolerance stops at headings: a heading is a landmark and scrolling to the wrong
  one costs nothing, while two buttons reading "Save" are not the same control. **Nothing hidden ever resolves** —
  a ring nobody can see reads as a broken tool, not as a miss. A section named by a heading is read to the next
  heading of its level or higher.
- **An image is always named, and its address rides only when asked for.** `readScreen` prints `[image: <alt>]`,
  and `[image]` for one with no `alt` — dropping the unlabelled one left a card that renders a picture reading
  exactly like a card that renders nothing, and "this page shows no image" is the one answer the screen cannot
  support. `readScreen({ images: true })` appends `(<src>)` to each, for handing one to a tool that takes a
  picture; it is off by default because a gallery is one long URL per thumbnail, which is the read's whole budget
  spent on the part of the screen it can say the least about. A `data:` URL is never printed — that is the bytes
  themselves rather than somewhere to fetch them.
- **A screen is only aimable if its names are printed.** `readScreen` writes `(#anchor)` beside a heading that
  opens an id'd or scoped container, and a truncated read ends with the headings below the cut — otherwise
  everything past the 8000-character limit is unreachable, because nothing names it, and an agent asked to point
  at a section it cannot name guesses a slug and is refused. A refusal lists the sections actually on screen.
  `highlight` scrolls its target into view and flashes it **once the scroll lands**, since a smooth scroll across a
  long page outlasts the flash; it is the one built-in that exists for the *user's* benefit, because showing where
  a control is beats writing directions to it.
- **`<Agent.Skip label="site footer">` leaves a region out of the default read** — chrome that costs tokens and
  answers nothing: a footer, a cookie banner, a nav that repeats on every route. What stands in its place is
  `[skipped: site footer]`, never nothing, because a deleted region reads as an absent one and an agent asked about
  the footer would answer that the page has none. The marker's name **is** a `section`, so naming it reads the
  region after all: what the marker withholds is the *default* read, not the region. It renders a wrapper div, so
  where that would move a flex or grid layout put `data-agent-skip="<name>"` on the element the page already
  renders — an unlabelled attribute falls back to the tag name, which is why the raw form belongs on a `<footer>`
  or `<nav>` and the component insists on a label. A region that is hidden anyway leaves no marker claiming it is
  there. **It hides text, not behaviour**: tools and state keys are declarations rather than markup, so an
  `st.tool` inside is published exactly as before and `highlight` still reaches a control in there. This is
  `field.visual` one layer up — cost, not secrecy.
- **Reach for it second.** A read narrows from the other side too: `Agent.Zone` and `readScreen({ section })` scope
  to one container, which beats blocklisting five regions on a screen that is mostly chrome. And a footer is last
  in the document, so on a page long enough to truncate it was already past the cut — the regions worth marking are
  the ones *above* the content.
- **Every tool's return value is bounded at 20,000 characters before it enters the transcript** (`ToolOutput.limit`,
  clipped with a note that gives the real size and tells the model to read a narrower part). `readScreen` caps
  itself; nothing else did, and a store key is sized for a screen rather than for a model's window — one
  `readState` of a list whose rows carry inlined bytes is megabytes, which the loop then posts on this turn *and on
  every turn after it*, so the window fills after four messages. Compaction cannot save that: it summarizes what is
  above the cut and a result this large arrives below it. Clipped rather than dropped, because a model handed a
  value it cannot see the end of asks a narrower question, where one handed nothing answers from the field names.
  The cap is a safety rail, not the design: a tool should return what answers the question — an id, a count, the
  three fields the agent asked about — and `AgentContext` inlines only small primitives for the same reason.
- **A slow tool reports its own progress with `AgentProgress.report(message, { done, total })`** from wherever the
  work is — a store action, an upload loop, an adapter — reached through a module slot rather than a parameter, and
  a no-op when nobody is rendering it. The chat shows it on that call's row until the row resolves. It is the
  browser twin of `McpProgress.report`. Import it and `AgentAbort` from `akanjs/store`: an app may not reach
  `use-agentic` directly (`no-import-external-library`), and those two are the channels a long tool body needs.
- **One turn carries every call the model made in it, and they run in order.** An assistant turn may hold any
  number of tool calls; the session executes them one at a time, in the order they arrived, and posts them back as
  one `tool` message. A batch therefore costs **one** model round trip, where the same calls chained one per turn
  cost a round trip *and* a resend of the whole transcript each — and then meet the turn cap halfway through. The
  framework asks for the batch in its own half of the system prompt (`AgentService.preamble`); what an app adds is
  a tool that does the whole job in one call, so there are fewer calls to batch in the first place. Two agents'
  calls still take turns page-wide — see Zones.
- **A chain of ten calls is usually a model checking its own work, not ten things to do.** Measured against the
  provider, the batch itself lands in one turn; what follows it is `readScreen → readState → readScreen`, one read
  per turn, confirming a write whose change report already said the same thing. The preamble tells the model not
  to, which is worth a turn and a half on a plain "approve what is pending". So a tool that returns *what
  changed* pays for itself twice — once as the answer, once as the reads it stops. The read a fresh route needs
  after `navigate` is acquisition rather than confirmation and is unaffected.
- **A batch reports each changed resource once, at the end.** Every call takes its own before-and-after, so eight
  approvals would each attach the whole list they approved from — and by the time the model reads the message,
  only the last copy is still true. The superseded ones are dropped (`ToolOutput.deduped`), so a resource several
  calls touched appears once, as it finally stands, on the last result that touched it. What each call did is
  still its own `result`; do not compensate by returning the collection from every write.
- **The turn cap is a question, not a dead end.** At `maxTurns` the session asks whether to keep going through the
  same card `askUser` uses, and the answer rides as the user's own turn — so a steer typed instead of the
  keep-going choice reaches the model as guidance. A host that renders no `pendingQuestion` passes no
  `continueAsk` and keeps the old failure, because asking with nobody listening would hang.
- **`askUser` is a fourth built-in the *session* owns, not the surface.** The answer comes from the conversation
  rather than the screen, so it rides on every turn whatever the page declares, and a zone agent asks inside its
  own transcript. `choices` offers a pick (`multiple` for several) and omitting them asks for free text; the card
  keeps a free-text row either way, because the model wrote the options and only the user knows whether the answer
  is among them. The loop parks on the question exactly as it parks on an approval, a dismissal is the tool's
  error result rather than a silent empty answer, and the settled exchange renders as question-and-answer instead
  of a tool row. **Never re-implement it per screen** — a `st.tool("askAboutX")` that opens a modal is the same
  thing with a worse transcript — and a hook tool named `askUser` shadows it like any other built-in. The line
  between it and a `.card()` tool is what the answer *is*: a sentence or a pick off a list is `askUser` and belongs
  to the conversation, while a shape the model must not invent — fields, a form, a signature — is a card the screen
  declares, because only the screen knows what filling it in looks like.

## What The Page Draws
- **The page shows the agent's work, not just the transcript.** A chat panel is closed as often as it is open, and
  a form that fills itself or a tab that switches on its own is a change the user watches happen with nothing
  anywhere attributing it. So **the control a call was published from is ringed** where it stands, scrolled to
  first when it is off screen, and **a pointer travels to it and presses it** — both on by default, and both
  driven from the tool call itself rather than from a store action, which cannot tell the agent's write from the
  user's.
- **It costs an app nothing, for the same reason `data-akan-action` does.** `onChange={st.do.setTitleOnTask}` by
  reference is what annotates the control, and the annotation is what makes it findable — so the fields and verbs
  that matter light up with no code. An inline arrow publishes no tool, carries no annotation, and therefore
  draws nothing: one wrapper silently costs three things at once.
- **For a control the framework did not render, spread `agentAttrs`** from `akanjs/ui`:
  `<button {...agentAttrs(run)} onClick={run}>`, where `run` is what `st.tool(…).exec(…)` returned. It reads the
  name off the callable, so there is nothing to keep in sync and no `ref` to thread — and it earns the same E2E
  selector and accessibility name an `akanjs/ui` control has. Never hand-write `data-akan-*`.
- **A control that shares its handler with its siblings takes a key**: `agentAttrs(switchTab, menu)`, in the same
  vocabulary the call's argument uses. One tool serves a whole tab strip or a whole list, so without it every
  namesake is interchangeable in the DOM and the page can say *what* the agent did but never *where* — which the
  no-guessing rule then turns into drawing nothing. `Tab.Menu` passes its `menu` key; do the same for a row verb
  whose id the call names.
- **Almost nothing is waited on.** The call starts the moment the effect is handed its event; a ring that lands a
  frame later costs the turn nothing, and an animation that held a call would make the agent slower for a
  decoration. A turn past four scrolls stops scrolling and keeps ringing — eight scrolls across a page is motion
  sickness rather than attribution. **The one exception is `navigate`**, whose press has to land before the router
  replaces the tree the link is in; it is capped at 600ms and the call goes either way.
- **What it refuses to draw is the point.** A name several rows answer to rings nothing rather than guessing a row,
  a call an approval or a guard turned back is never drawn at all, a tool no control carries draws nothing, and a
  backgrounded tab draws nothing. A ring on the wrong element is worse than no ring: it is the screen telling the
  user something untrue about what just happened. **A control the screen is not actually showing is not pointed at
  either, and the pointer goes rather than travelling to it**: `checkVisibility` answers about an element alone, so
  one under a modal's backdrop, inside a drawer that has slid off, or faded to nothing all pass it while being
  invisible, and a pointer sent there lands on a blank patch of overlay. The test is `elementFromPoint` at the
  control's own centre, taken after the reveal has settled. **`navigate` is mostly in that last class** — the router is not
  an element, so it draws nothing. A bar across the top of the page was tried for it and removed: it read as
  chrome the page had grown rather than as the agent doing something, which is the opposite of attribution. What
  it does draw is the **link already on screen that goes where it is going**, when exactly one does and the user
  can already see it: that one is an element, and the pointer presses it before the route moves. Addresses are
  compared as routes (`router.routeOf`), since the locale and base-path segments are on the `<a>` and never on the
  tool argument. An off-screen link is left alone — scrolling to a link and then leaving the page it is on is two
  motions for one act. **Link presence is a drawing condition, never a permission one**: the agent may navigate
  anywhere the user could type, and a zone that must not leave one screen drops `navigate` through `builtins`.
- **Turn it off with `visual`** on `Agent.Chat` / `Agent.Zone` — `false` for all of it, `{ cursor: false }` or
  `{ reveal: false }` for one effect. The pointer is chrome (`data-agent-ui`, `aria-hidden`,
  `pointer-events: none`), so `readScreen` never reads it back and `highlight` can never aim at it.
- **`ToolActivity` is the channel underneath**, a `ToolRunner` host option and an `AgentSession.onActivity`, firing
  `start` / `end` around the execution alone. It is deliberately not `progress`: that one fires only for a tool
  that chose to report, and a tool that says nothing about itself is exactly the one whose effect arrives
  unexplained. The `start` may answer a promise, and the call waits for it — the whole of what makes drawing a
  click on a link possible.
- **`AgentSession.onTurn(running)` is the other half**, and the unit the pointer's life is measured in. A model's
  calls arrive with its own writing between them, seconds each, so a pointer that lived for the length of a *call*
  spent every turn vanishing and coming back. Only the conversation loop reports there — `compact` runs under the
  same internal flag and drives nothing on screen.
- **The pointer presses on arrival, never on departure** — a press fired as it leaves is a click on whatever it
  was still over. It glides only when the hop is far enough to be worth following (a third of a second to cross
  fifty pixels reads as lag, not motion), and teleports otherwise. It appears at the first control it presses,
  **drifts clear of what it pressed** and waits out the gap between calls there as a spinner — a person clicks and
  takes the hand away, and a spinner left sitting on the button covers the change it just caused — and fades when
  the turn ends; **a turn that
  drove no control draws no pointer at all**, since parking one in a corner for a turn that only answered a
  question claims something that did not happen. While a reveal scrolls, it holds still — as a person's does — and
  carries a chevron pointing the way the view is travelling, because stillness over a sliding page otherwise reads
  as a pointer that has come loose rather than as the one doing the scrolling. The ring answers *where* and the
  pointer answers *who*, which is why they are one default rather than two.
- **A form patch fans out over the fields it named.** `fill<Model>Form` is published by the form rather than by any
  one control, so it rings one control per field in the arguments — resolved through the same
  `data-akan-state="<model>Form.<field>"` the setter annotates — capped at five. `writeOn<Model>(path, value)`
  draws nothing, for the same reason it carries no annotation: there is no control to put one on.
