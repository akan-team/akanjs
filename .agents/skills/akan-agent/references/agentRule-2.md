<!-- akan:generated -->

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
  `data-akan-action` like a store setter does. A name starting with a write verb (`remove`, `delete`, `create`,
  `update`, `upsert`, `submit`, `save`, `send`, `export`) asks the user first unless it says `{ confirm: false }`;
  `AgentConfirm.set({ byName })` moves that default app-wide. After a tool marked `taint: "source"` (`readScreen`,
  `readState`, `viewImage`) returns text the user did not write, the next call that changes something asks once,
  whatever its own `confirm` says, until the user approves a call; `taint: "exempt"` marks a tool that only moves the
  view, and `AgentConfirm.set({ afterScreenRead: false })` turns the rule off. `st.tool("x", { label:
  l("ticket.archive") })` gives the action a name a person reads — `Agent.useScreenActions()` hands it to a command
  palette, and the model never sees it. Reach a store action
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
- **A command palette lists the same declarations.** `Agent.useScreenActions()` returns the screen's published
  tools that take no required argument, each with a `run` that calls the control's own handler (guard included,
  not logged as an agent call) and `needsConfirm` for the ones a person should confirm — so ⌘K offers exactly
  what the agent can do here, with nothing declared twice.
