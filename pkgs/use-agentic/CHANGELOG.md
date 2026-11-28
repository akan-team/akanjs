# use-agentic

## 0.4.0

### Minor Changes

- 0c6dc44: A context block can say that its text is someone else's, and a turn sent with one, or with a message that points at a record, asks before the next change.

  - **`ContextBlock.untrusted`.** A host's `buildContext` marks a block `untrusted: true` when it holds text someone other than its developer or the user may have written, such as a record's title. A backend fences such a block as page content (`WIRE.md`).
  - **A turn sent with a marked block counts as a `taint: "source"` read.** The first change after it pauses on `pendingApproval`, whatever the tool's own `confirm` says, until the user approves a call. The same marked text on a later turn does not ask again; changed text does. `askAfterUntrusted: false` turns this off with the rest of the rule.
  - **A message with `references` counts as such a read too.** A reference's label and value are the record's own text, so the first change after the message asks first, once per set of references in the transcript. A transcript restored with references asks on its first change as well.
  - **A compaction digest names a pointed-at record by its pointer**, `[referenced note/n1#title, value not carried into this summary]`, without the record's label. `WIRE.md` now says a backend frames a `summary` message as fenced data in a user-role turn, never as a system message.
  - **A write's change report keeps what the screen block keeps.** An entry holds a token, a number, a boolean, an ISO timestamp or a short list or object of those, and is marked `withheld: true` (the new optional `ResourceDiff.withheld`) when anything was left out.
  - **`ToolRunner.sending(request)`** is how a host that drives a `ToolRunner` itself reports what a turn sends: it returns the request it was given. `AgentSession` calls it for every turn.

  **Upgrading.** A host that stages references (`session.stage`, `session.refer`) must render `pendingApproval`, as a host that publishes a `taint: "source"` tool already must: the first change after a mention now waits on it. To keep such changes running as each tool's own `confirm` decides, pass `askAfterUntrusted: false`. Nothing else changes for a host whose context blocks carry no `untrusted` field. A host that already used a field named `untrusted` on a context block for something else must rename it: any value but `false` or `undefined` now marks the block.

## 0.3.0

### Minor Changes

- ce817b6: An agent's tool call runs only as the action the screen declared when the call arrived. After the user approves, and again right before it runs, the runner requires the same declaration under that name — the same description and parameters, and the same confirm message for the approved arguments — rather than the same registration, so a list row mounting while the user decides no longer cancels an approval, and a different declaration that took the name over is refused with "<name> changed on screen before it ran, so it did not run." `st.tool(name, { label })` (use-agentic's `ToolEntryBase.label`) names an action for a person, in their language, and is never sent to the model. `Agent.useScreenActions()` returns the screen's argument-free tools for a command palette, each with its `label`, leaving out the tools a person answers with a card.

  `AgentActivity` takes `keepGuides` (use-agentic): a subtree that is off screen publishes no tools or state but keeps saying its guidance, and `AgenticSurface.gated(gate, guideGate)` names the gate guidance follows.

  Upgrade note: the check covers calls that need no approval too. Such a call used to run whatever registration held its name by then; it now returns that refusal to the model when the declaration under the name changed after the call arrived.

- ed26089: The in-page agent can look at a picture on screen. A new built-in tool, `viewImage({ src })`, takes an image address that `readScreen({ images: true })` printed, redraws that `<img>` as a JPEG no longer than 1568px, and attaches it to the tool's result, so the model answers from the picture rather than its caption. It refuses an address no `<img>` on screen shows, and a `data:` one. A public picture the page may not read is sent by its address.

  A tool result can now carry files in `ToolCallResult.attachments`, which have the same shape as a user's attachments. A tool of your own returns them with `ToolReturn.attach(result, [attachment])`, exported from `akanjs/store`. `AnthropicLlm` places them inside the `tool_result`. The OpenAI dialect sends them in a user message right after the turn's tool messages, and an MCP App hands a picture to the host's model as image content. Either way, they pass the same `accepts` check and image-type allow-list as a user's file, and one the model cannot read becomes a note in its place. They sit outside the 20,000-character result ceiling but meet the 4 MB per-file one. A file a tool returned before the user's latest message is sent as a note asking the model to call the tool again, and it is never written to stored history.

  Upgrade note: `viewImage` joins the default built-ins, so `builtins={true}` and an omitted `builtins` now publish it. List the built-ins you want to leave it out.

### Patch Changes

- 18f0bd8: Fixes from a CodeQL code-scanning and code-quality pass:

  - The `"use client"` check that the build runs on every module no longer backtracks exponentially on leading block comments (about 30 one-line comments hung the build), and it no longer reads `/* a */ x /* b */ "use client"` as a directive.
  - A package `exports` wildcard target with more than one `*` has every `*` replaced, as Node does, in the build's resolver and the barrel-imports plugin.
  - A tunnel agent ignores a gateway heartbeat outside 1 s to 5 min and keeps the 30 s default; Bun runs a NaN, negative or over-2^31 interval every millisecond.
  - The in-page agent's screen text prints no `data:` or `vbscript:` link, in any letter case, as it already printed no `javascript:` one.
  - A markdown link label or a mention label no longer spans a `[` or `@[` where another one starts: `[a [b](u)` links `b`.
  - `web_fetch` decodes `&amp;` last, so `&amp;lt;` reads as `&lt;`, and strips `</script >`-style end tags.
  - Native: `google_services.xml` escapes backslashes, a share refuses a `vbscript:` link, and the dev shim escapes `<`, `>`, U+2028 and U+2029 in the values it inlines.
  - `trimSlashes` and `trimTrailingSlashes` in `akanjs/common` trim in linear time; the framework's slash, email, translation and route-parsing regexes are now linear with the same results.

- 50afb48: An `@` mention whose title holds a bracket, such as "[Ops] Minutes", is now a chip and is sent with the message. `Reference.token` used to write the label as it was, and the reader stopped at its first `]`, so the token stayed raw text and the value it pointed at was dropped. A label's `\`, `[` and `]` are now backslash-escaped in the token, as in a markdown link, and `Reference.parse` and the composer read them back. A token written before this change still reads, unless its label ends in a backslash. `Reference.pointerOf(match)` turns one match of `Reference.pattern` into its pointer.

## 0.2.0

### Minor Changes

- 8c31d54: The in-page chat guards the model's window, and answers a refusal for length by compacting once

  Compaction used to watch one number: the transcript, estimated at four characters a token, against `compact.at`
  (24k). It did not know the window, did not count the tools, the screen context or the instructions that ride every
  turn, and read Hangul — nearer one character a token than four — as a fraction of what it costs. Measured on a
  single live DeepSeek turn: the transcript estimate said 23 tokens where the provider counted 458. And when the
  provider refused a prompt too long for its window, the turn simply failed.

  **The relay now reports what it knows.** Every turn's `done` carries the provider's own count (`usage: { input,
output }`, `input` the whole prompt) and what the adaptor knows about its model (`limits: { window, output }`).
  The window is declared with `option.setLlm({ contextWindow })` — a table of models would be a claim about models
  that ship after it. `LlmAdaptor` gains an optional `limits`; `AnthropicLlm` reports the answer ceiling it always
  sends, `OpenaiLlm` sends none and so reports none.

  **The session compacts on whichever trigger comes first.** `compact.at` stays, with its 24k default, as a ceiling
  on what each turn costs — the relay resends the whole transcript every turn and the app pays for each one. Beside
  it, once the window is known, a guard compacts when the prompt passes `window − answer ceiling (8,192 when
unreported) − compact.buffer (13,000)`, measured by the provider's count of the last turn plus the estimate for
  what arrived since. `{ at: Infinity }` leaves only the guard; `{ at: 0 }` still turns all of it off. The count is
  kept on the assistant message (`ChatMessage.usage`), never sent, and dropped from what a compaction keeps.

  **A refusal for length is answered once.** Adaptors build refusals through `LlmOverflow.refusal(host, status,
reason)`, which reads each provider's own "prompt too long" sentence as `agent.error.contextOverflow` with the
  `limit` it named. The relay flags it `overflow` on the wire; the session drops the empty draft, compacts, sends the
  same turn again and remembers the window. A second refusal in the same send fails with the translated message.
  An app's own adaptor that throws through `LlmOverflow.refusal` recovers the same way.

  The chat header now reads `~31k / 107k tokens` — the estimate against whichever trigger is nearer — with the point
  it compacts at in its tooltip.

  ## Upgrading

  Nothing is required. To turn the guard on, declare the window your model has:

  ```ts
  option.setLlm({
    apiKey,
    model: "deepseek-flash",
    host: "https://api.deepseek.com",
    contextWindow: 1_000_000,
  });
  ```

  A backend of your own that speaks the turn wire (use-agentic `WIRE.md`) opts in by adding `usage` and `limits` to
  its `done` event and `overflow: { limit? }` to a refusal for length; one that sends neither keeps working as before.
  The usage, limits and overflow fields ride the streaming answer — which is what `httpRunner` negotiates — and are
  not added to the relay's single-JSON `AgentTurn` answer.

- 5f53462: A message carries the data the user pointed at

  An in-page agent could be handed files but not data. What was on the screen reached the model only as the turn's
  `ContextBlock`s, which are reassembled from the screen every turn — so a record named three turns ago is not in the
  conversation any more, and there was nowhere to say _which_ record, or which field of it, somebody meant.

  `ChatMessage.references` is that place, beside `attachments` and for the same reason: what a person referred to
  while asking is part of the asking. A `MessageReference` names the host's own `refName`, the id, a label, and
  optionally a dotted `path` into the document, and carries the `value` those resolved to.

  Three properties are load-bearing and deliberate:

  - **The value is a snapshot.** It is what the data was when the message was sent, never re-read later. Re-reading
    would rewrite what the person was looking at when they spoke — and the common case is an agent that then edits
    the very field it was pointed at, which would leave the reference showing the result with no record of what was
    being changed from. `refName`/`refId`/`path` travel so a tool can read the current value when the answer needs it.
  - **The value arrives masked, and nothing downstream can mask it again.** Masking needs the model class, which no
    wire carries, so whichever model the host names when it stages a reference is the whole of the decision about
    what leaves the browser.
  - **It is bounded at 20,000 characters per reference, at both ends.** A reference is bulkier than a tool result and
    outlives one: it rides every turn from the moment it is sent and is the last thing compaction folds, because
    folding what the user pointed at is folding the question. `Reference.clipped` bounds it as it is staged, and
    `AgentService.referenceLimit` bounds it again where nothing can route around it.

  `AgentSession` holds the staging slot — `stage` / `staged` / `unstage(key)` / `clearStaged()` — rather than the
  composer, which is where staged files live. The difference is not an inconsistency: a file only ever arrives from
  the composer's own picker or drop zone, while a reference arrives from whichever component drew the data, reaching
  the session it is already inside. Unstaging is keyed on `refName/refId#path`, never on an index, because what
  orders the references of a message is its text.

  The server folds them into the message text in one place (`AgentService.referenced`), under a heading that says the
  values are a snapshot. Text is the one field every provider mapping already reads, so Anthropic, the OpenAI dialect
  and the text-only default all carry references with no change between them and none of them can drop one quietly.
  A string value prints as itself rather than as escaped JSON, which is the common case and the readable one.

  Persistence keeps the pointer and drops the value, with a note saying so — a restored conversation re-reads what
  was pointed at with a tool instead of guessing from the label, which is a better answer than a restored attachment
  can give.

- 5f53462: The composer can point at data, from the menu or from the screen

  Builds the user-facing half of message references on top of the carrier. There are two entry points, and which one
  applies depends on who knows the value.

  `<Agent.Chat reference={[…]} />` takes a `ReferenceSource` per kind of document — `refName`, a `type` in
  `st.expose`'s vocabulary, the app's own `search`, and a `resolve` — and the composer's `@` menu offers whole
  documents from them. Which documents somebody may point at is the app's answer, so the source brings the query; the
  framework brings the token, the masking and the snapshot. The token is written the moment a row is picked and the
  value is staged when `resolve` lands, so a slow fetch never freezes the menu and one that fails leaves a pointer
  rather than a chip that means nothing.

  `useAgentReference()` is the other half, for a field _inside_ a document. The component drawing it already holds
  the value, so it hands that over with no round trip — and it is the only thing that knows a rich-text field stored
  as `field(Any)` reads as a paragraph rather than as the editor document it is stored as. It no-ops with a warning
  outside a session, the call `AgentValue.publishable` already makes: a card carrying a reference button must not
  cost a route its render.

  **The token in the draft is what carries a reference; the chip only draws it.** Deleting the token by hand drops
  the reference exactly as removing the chip does, because removing the chip removes the token. Nothing re-derives a
  value from edited text, so a token pasted out of an earlier message travels as a pointer with a note — the same
  shape a restored conversation produces.

  Staging lives on the session rather than the composer, because `useAgentReference` is called from components the
  composer cannot see. Writing the token is still the composer's, so the session holds the unwritten ones as state
  and a chat acknowledges each by key: two chats on one session — a responsive app rendering a desktop and a mobile
  composer — each hold their own draft and each need the token, which a queue somebody drains would have given to
  whichever rendered first. `refer` warns instead of staging silently when no chat is mounted on that session, which
  is the case where a card sits outside the `<Agent.Zone>` its chat is inside.

  References also ride the parking queue, so one pointed at while a turn is running survives to the message it
  opens; taking a parked message back restores its values, and anything pointed at since wins, because the parked
  value is the older read of the same field.

- ccf2ae2: feat(csr): only the current page publishes to the in-page agent, and a page can bind work to being looked at

  A CSR page kept under the current one for a swipe back is mounted and live, so its `st.tool`s, resources, guides and
  `st.use` keys used to sit in the agent's surface beside the current page's. The agent was offered a lever the user
  could not see, and two pages declaring one name clashed.

  - **`<AgentActivity active>`** (`use-agentic`) publishes what is registered below it only while `active`.
    Registrations stay in place, so turning it back on re-publishes without a remount. A parked registration shadows
    nothing and never clashes with a published one. Nested activities close with their parent. A registry kept outside
    the surface reads the same gate through `useAgentGate()`. Under it are `AgenticSurface.gate(active, parent?)` and
    `AgenticSurface.gated(gate)`, and the registration methods take the gate as an optional trailing argument.
  - Every CSR page container renders one, open only for the current page. The store's live keys follow it, so
    `readState` answers for the screen the user sees.
  - The agent's screen targeting (`highlight`, a zone's `readScreen`, the cursor) skips anything under an `inert`,
    `aria-hidden` or `hidden` ancestor, not only elements that carry one themselves.
  - **`usePageFocusEffect(effect, deps)`** (`akanjs/webkit`) runs `effect` while the user is on the page and cleans it up
    when they leave: after the entrance settles, and as soon as the page starts to go. It is for a camera, a poll or a
    key binding that a live page under the current one must not keep running. **`usePageActivity()`** answers
    `"current" | "prev" | "pending" | "hidden"`, and `current` outside a CSR stack.

### Patch Changes

- 69f7178: feat: the in-page agent can ask the user instead of guessing

  `askUser` is a fourth built-in on every turn, and the **session** owns it rather than the surface: the answer comes
  from the conversation, not the screen, so it needs no declaration from the page and a zone agent asks inside its own
  transcript. `AgentSession` parks the loop on `pendingQuestion` exactly as it parks on `pendingApproval`, and
  `Agent.Chat` renders the question card above the composer — which is closed anyway while a turn runs, so the card is
  the only way in.

  `choices` offers a pick (`multiple` for several) and omitting them asks for free text. The card keeps a free-text row
  either way, because the model wrote the options and only the user knows whether the right answer is among them.
  Dismissing is the tool's **error** result rather than a silent empty answer, so a model that asked cannot read a
  skipped question as consent; an aborted turn settles the same way. A question with no text is refused without ever
  reaching the screen, and choices are trimmed and deduped because the answer is the option's own text — two identical
  options cannot be told apart.

  A settled ask renders as the exchange it was, question then answer, instead of as a `askUser` tool row: while the
  question is pending only the card holds it, so the text is never on screen twice. A hook tool named `askUser` shadows
  the built-in like any other, and the relay needed no change — the tool rides the same wire the surface's own do.

- 5f53462: An attachment can carry the host's own handle on the file, and the composer's ceilings are the app's

  `MessageAttachment.ref` is opaque to the framework, which only moves it — a file id, a storage key, whatever turns
  the attachment back into something a tool can be handed. Without one, a host that stores its uploads keeps a map
  beside the transcript keyed on name and size, which is the guess `Attachment.same` has to make and the one that is
  wrong for two crops of one export; when both sides carry a `ref`, that is now the answer instead.

  The per-file ceiling is measured on what `attach` produced rather than on the file that was picked, so a reader
  that uploads and answers a `url` is no longer refused for a cost it does not incur. All three ceilings become
  defaults behind `<Agent.Chat attachLimits={{ perFileBytes, perMessageBytes, perMessageCount }} />`, since what one
  request can carry belongs to the configured provider.

  A `url` the reader answers is handed to the provider as the address it will fetch, which is now documented on
  `attach`: the default storage backend serves a path only the app can resolve, and a model given one answers about
  a picture it never saw with nothing anywhere reporting a failure. Answer `data` when the provider cannot reach it.

- 5f53462: fix: a batch of tool calls reports each changed resource once, as it finally stands

  Every call takes its own before-and-after of the surface, so eight approvals in one turn each attached the whole
  task list they approved from — eight copies in one `tool` message, each bounded at 20,000 characters on its own,
  riding every later turn until compaction.

  Size is the smaller half of it. The model reads the batch as one message, and by then only the last copy is still
  true: the first seven are stale snapshots of a value printed directly below them. `ToolOutput.deduped` keeps the
  last report of each resource and drops the superseded ones, so the batch says what changed once and says it
  correctly. Dropped rather than marked, because a change entry with no value is a reason to go and read the screen
  again — the round trip the change report exists to save. What each call itself did is still its own `result`.

  The framework asks the model to batch independent calls, so this is now the common shape rather than the rare one.

- 5f53462: feat: the in-page agent issues independent tool calls in one turn instead of one per turn

  A turn has always been able to carry several tool calls — the session collects every `toolCall` event, runs them in
  order and posts them back as one `tool` message — but nothing asked the model to use it. A screen that needed ten
  calls got ten turns, each paying a full model round trip and a resend of the whole transcript, and the turn cap
  then parked the run on a "keep going?" card halfway through.

  - `AgentService.preamble` is the framework's own half of the system prompt, ahead of whatever the app declared. It
    asks for the batch — every call that does not need another call's result goes in the same turn, and a tool that
    does the whole job in one call (a form's fill tool) beats one call per field — and it asks the model not to read
    the screen back to confirm work it has just done, since the change report it was handed already says so. Both
    sentences were measured against the provider: "approve these eight" went from 1.5 turns (with three runs in eight
    doing nothing at all) to one turn in every run, and "read the screen, then approve what is pending" from 3.0
    turns to its floor of 2.0 in every run. The read a fresh route needs after `navigate` is acquisition rather than
    confirmation, and survived in every run of that scenario. It is composed in the service rather than in an adaptor
    for the reason `explained` is — an adaptor that has to remember it is one that forgets.
  - The turn cap defaults to 12 assistant turns instead of 8. A chain of ten calls could not finish under the old
    default without the user answering a question first.
  - `readState` and `highlight` declare `settle: false`, as `readScreen` already did. A settle is 120ms of DOM quiet
    at the very least, and neither of them changes anything a resource holds, so ten reads paid a second and a bit
    for a change report that is empty by construction.

- 5f53462: feat: a tool the user answers, rendered in the chat by the app that declared it

  `st.tool("collectContact").desc("…").card(({ submit, cancel }) => <Contact.Form …/>)` is a second way a tool chain
  ends. Where `.exec()` runs a function, a card parks the call in the chat and renders the app's own component there;
  what the form submits is the call's result, and cancelling is the error the model reads instead. A name and a phone
  number, a date somebody has to look up, a signature — those are answers a model must not invent, and until now the
  only surfaces a chat could park on were the approval gate and `askUser`'s question, neither of which carries a
  shape.

  `AgentSession` holds it as `pendingCard` beside `pendingApproval` and `pendingQuestion`, and `Agent.Chat` renders it
  in the same place; `AgentToolCard` is an `_overrides.tsx` slot like the other two. The frame draws its own way out
  even when the app's component does not, so a turn can never park on something the user cannot dismiss.

  The call waits **outside** the tool queue, for the reason an approval does: a form parked in front of somebody is
  not work, and holding the execution lock across it would freeze every other agent on the page behind one unanswered
  card. The declared arguments are checked before the card is parked rather than while it renders — a throw inside the
  host's tree would take the chat down, where a verdict reaches the model as something it can correct — and `confirm`
  is not read for a card at all, because the card is already the asking. The screen is still snapshotted around the
  wait, so a card that writes what it collected into a store reports what moved like any other call.

- 69f7178: feat: the agent chat answers slash commands of its own, and the composer remembers what was sent

  **Five commands join the `/` menu the app's `prompt()` endpoints already appear in**: `/new` (`/clear`) starts a
  new conversation, `/retry` sends the last message again, `/copy` puts the transcript on the clipboard, `/help`
  lists the commands, and `/tools` lists what this screen published. An app writes none of them and cannot add one —
  the extension point for a product's own command is a `prompt()` endpoint, which is guarded and server-side.

  **A built-in wins a name collision with a prompt of the same name**, and a shadowed prompt is dropped from the menu
  rather than listed twice. That is the mirror image of the tool rule, deliberately: a component's `st.tool` shadows a
  built-in it means to replace, but no library's prompt may take `/new` away from the user who typed it. `/new` and
  `/copy` are also dispatched ahead of the is-a-turn-running check, because mid-turn is exactly when they are reached
  for — so `AgentSession.reset` now ends the turn it is clearing and waits for it to wind down. It used to return
  silently while one was running, and clearing before the abort lands leaves the dying turn appending onto an empty
  transcript.

  **A command's output is a `local` message: rendered in the transcript, withheld from the wire.** The transcript
  _is_ the model's history, so `/help` text appended plainly would come back on the next turn as something the
  assistant believes it said. `session.note(text)` writes one, `session.report(error)` stays what a host-side failure
  lands in, and `local` messages are left out of a `/copy` export — they are the chat talking to itself.

  **`/copy` exists because nothing else keeps the transcript.** The relay is stateless and the conversation lives only
  in that browser, so an export is the one path a wrong answer has to whoever could fix it; it carries the route and
  the timestamp for that reason. **`session.retry()`** replays only the trailing user message and leaves everything
  before it in place, so a prompt's own preamble is not sent twice.

  **↑ and ↓ in the composer walk what was sent.** A single-line input has nothing of its own on the vertical arrows,
  and the half-written draft they were walked away from comes back at the bottom of the walk — the other half of why
  a turn that fails for a reason unrelated to the ask no longer means retyping it.

- 8c31d54: fix: an in-page conversation no longer compacts away a screenshot, or most of its own earlier summary

  Two faults in how the transcript summarizes itself, both reproduced against the shipped defaults.

  **A picture was counted by its bytes.** The estimate is four characters to a token over the JSON a turn posts, and an
  inlined image's base64 is part of that JSON — so a 300KB screenshot read as about 100k tokens, four times the 24k
  threshold. The conversation compacted as soon as it passed six messages, which on a task that runs tools is the third
  call, and the screenshot the user attached to ask about went into the summary as a filename. A provider bills a
  picture by its pixels after its own downscale, so an inlined image now counts as `Compaction.imageTokens` (1,600)
  instead. An image attached by `url`, and a text attachment, are counted as before.

  **A previous summary was clipped to 1,200 characters.** The digest clipped every message's text, and the summary is a
  message, so the second compaction carried only the first 1,200 characters of the first one forward — and each one
  after lost more. It was also labelled `user:`, so the summarizer read the notes as something the user had said. A
  previous summary now rides the digest whole, under a `previous summary:` label and outside the digest's budget, and
  the summarizing instruction asks for it to be carried forward.

- f882bbc: feat!: `st.tool`, `st.expose` and `st.useState` become one chain, and a declaration's type is its mask

  **Breaking.** The three declarations an app writes for the in-page agent had three different shapes and two
  options that did not carry their weight. They are now one shape — `<entry>(name, …) → .desc(text) → <terminal>`,
  where the terminal call is the hook — and every option left is one the runtime reads. Migration guide:
  `local/tool-migration.md`.

  ```ts
  st.tool("removeTask", { confirm: true })
    .desc("Remove one task.")
    .arg("taskId", ID)
    .opt("force", Boolean)
    .exec(fn);
  st.expose("openNote", cnst.LightNote).desc("The note on screen.").value(note);
  const [tab, setTab] = st
    .useState("tab", String, { set: true })
    .desc("Which tab.")
    .init("all");
  ```

  **`.desc()` is required, and it is now load-bearing twice.** A model picks a tool by that sentence and by nothing
  else, so a tool without one was a tool an agent could only guess at. It also replaces `shared: true`: a row
  component registering fifty `removeTask` is fifty copies of one name _and one description_, which the surface now
  reads as one declaration, while a second description arriving under a name already taken is two components that
  collided and still warns. `shared` was an unverified claim whose only effect was suppressing that warning — a flag
  that said "trust me" where the description already says the same thing, checkably.

  **`effect` becomes `settle`, because only one of its three values ever did anything.** `"query"` skipped the wait
  for the screen to settle before the call's effect was reported; `"state"` and `"mutation"` were indistinguishable
  at runtime, were dropped before reaching the model, and coloured a badge. What is left is the fact the session
  actually needs: `{ settle: false }` is a read that returns what is already there, and everything else is waited
  out because a write may still be landing when `exec` resolves. `effect` also leaves `PublishedTool`, the relay
  wire (`AgentWireTool`, `WIRE.md`) and the `/tools` dock badge.

  **`.arg()` is required and `.opt()` is optional**, matching the filter builder's vocabulary, so an optional
  argument is a different call rather than an options bag — and the `exec` parameter widens to `| null` only for
  `.opt`.

  **A readable value declares its type, and the type is the mask.** `st.expose(name, Type)` and
  `st.useState(name, Type)` take a scalar, an enum, a model class, a one-level array of those, or `Any`. The type
  typechecks what the component hands over — a model resolves to its state object, so a hydrated document and a
  plain copy of one are equally accepted — and it decides how the value reads: a model strips its own `hidden`,
  `secret` and `visual` fields by the model that was _named_ rather than by whatever class the value still carries,
  and a `Date` leaves as an ISO string. That subsumes `mask:` and `serialize:`, both of which are gone; `Any` is the
  escape hatch and passes the value untouched. A type nothing can read is reported on the console and left
  unpublished rather than thrown, the same degradation an undescribable `.arg` already had. `.value()` also takes a
  thunk, read when the agent reads, for a value assembled out of a ref the children fill in after the render.
  `st.useState`'s `set` is now a boolean, since the write schema comes from the same type.

- 5f53462: A stopped turn leaves no bubble that is still writing

  `AgentSession` opens an assistant draft before the first token arrives, and Stop caught before that token left the
  draft in the transcript forever. `Transcript` already drops an empty assistant message, so the wire and the
  persisted history were both correct and the rendered array was the one place it survived — which is exactly the
  array a bubble reads to decide it is still being written, so the pulsing dot never stopped. The turn's own settle
  now drops it, using the predicate `Transcript` already applies. A turn a provider ends without saying anything
  leaves nothing behind either, for the same reason.

- 5f53462: An attached image shows up, and survives a reload with its handle

  The attachment chip only drew a thumbnail for an inlined `data` attachment, so an image attached by `url` — the
  shape the per-file ceiling exists to encourage, and the only shape a deployed app produces — rendered as a bare
  name in the composer and in every bubble. It draws either carrier now.

  `sessionHistory` dropped `ref` on the way to storage. The reason content is stripped is that web storage is a few
  megabytes and a failed save is silent; an id is not content, and it is the one thing a restored conversation has
  left to find the file again — without it a host is back to guessing from name and size, which is the guess `ref`
  was added to retire.

  `Chips` is exported as `AgentAttachments`, so a replaced `AgentBubble` draws the attachment row with the framework's
  rule rather than a copy of it. And a compacted attachment now says its content is gone instead of only naming
  itself, on the same principle as every other note here: a model told only `[attached photo.png]` answers about the
  picture from its filename.

- 69f7178: feat: akanjs/ui drives itself for an in-page agent

  The framework's own components now publish the controls they draw, so an app gets a working agent surface for
  list management, tabs, paging, forms, dialogs, and the app shell without writing a line. Names are the store
  action's wherever one exists (`setSortOfTaskInOrg`, `removeTask`), so the tool an agent calls and the action the
  button dispatches read the same.

  - **`Data.ListContainer`**, and so every `Model.AdminPanel`: view mode, sort, page size, refresh, create, the two
    exports, and the row and modal verbs — `edit`/`view`/`remove` by id, plus `submit`, `cancelEditOf`,
    `closeViewOf`. It also opens a `<slice>.items` resource, which is where the id for a row verb comes from.
  - **`Tab`**, **`Dialog`**, **`ScreenNavigator`** take a `namespace` prop and publish under it. Without one they
    publish nothing: two tabs on one screen would otherwise answer to a single name, and the first to mount would
    lose. `Tab`'s menu registry became a `Map` of menu to disabled, which also stopped the disabled-tab fallback
    from landing on another disabled tab.
  - **Paging** is one shared `usePageTool`, spoken by all three components that draw a pager.
  - **`Layout.Sider`**, **`System.SelectLanguage`**, **`Link.Back`** publish the shell controls.

  **Forms fill themselves, from two sides.** An app writes no `st.tool` for a form.

  A form control handed its setter **by reference** — `onChange={st.do.setTitleOnTask}` — publishes
  `setTitleOnTask` while it is on screen. That is the same reference that already earned `data-akan-action`, so the
  agent's tool and the person's control are one function, and an inline arrow still publishes nothing. Scoping
  publication to the control rather than to the model is what keeps an agent out of a field the template draws
  nothing for.

  `st.use.taskForm()` adds one more: `fillTaskForm(patch)`. It takes several fields in a single call, and it is the
  only way to reach a list, a map, or an embedded object — their rows are written through
  `writeOnTask("payments.3.name", value)`, an inline call that can carry no annotation. It is a patch, so a field
  left out keeps what the person typed. Its schema is every writable field, because a declaration is mount-static;
  the **guard** is where the screen gets its say, refusing a plain field whose control is not on screen and naming
  the ones that are. A composite is let through, because nothing can see whether its rows rendered — the one place
  left where an agent reaches a field the screen may not draw, and server guards still apply.

  Neither side touches a relation (picked or uploaded, never typed), a base document field, or a `hidden`/`secret`
  one **at any depth**: a read of those is masked, so publishing a writer would open the door its reader is barred
  from. A rejected third shape is worth naming — a single `writeOnTask(path, value)` tool — because its `value`
  could only be `Any`, which this framework's own MCP layer refuses for telling a model nothing, and a mistyped
  `path` writes a new key into the form that ships on the next submit.

  Nothing publishes a lever the screen does not have. A model with fewer than two sort keys draws no sort control
  and has no `setSortOf<Model>`; a panel with no template draws no create button and has no `new<Model>`; a list
  that fits on one page has no pager and no `setPageOf<Model>`. Callables go to the controls by reference, so
  `data-akan-action` lands on them and `readScreen` names each control with the word its tool has.

  Three gaps in the surface had to close first, all of them consequences of the surface being declaration-only.

  **A conditional surface had no legal shape.** `.exec()` is a hook, so a component can never skip the declaration —
  which left no way to publish a tool only when the screen renders its control. A falsy name now declares the tool
  and publishes nothing: the callable still drives the click a person makes, and the agent never learns it exists.
  `st.useState` and `st.expose` take a falsy name the same way. An unpublished callable carries no
  `data-akan-action`, because that attribute names a tool an agent can reach and this one cannot. This is what lets
  a list toolbar publish `setSortOfTask` only when it actually draws the sort control, instead of paying for the
  tool in every turn's prompt on every screen.

  **A value set only the render knows had no way in.** An `enumOf` class was already a complete argument type —
  `.arg("mode", TaskStatus)` publishes the values, refuses anything off them, and narrows the `.exec` parameter to
  the union — but a component cannot build one, because `enumOf` registers globally. A slice's sort keys or the
  options a prop carried could only be described in prose and hoped for. `.arg(name, type, { oneOf })` takes the
  list the render has and publishes and enforces it the same way. Neither reaches a set that fills in _after_ the
  first render, since a declaration is mount-static; that belongs in the tool's `guard`, which is re-read per call
  and can name the current values in its refusal — which is what `Tab` and the pagers do.

  **A list inside an `Agent.Zone` was invisible to that zone's own agent.** `useScreenScope` opened its scope at the
  root rather than under the scope it is mounted in, so `Load.Units` inside a zone registered `<slice>.items` at the
  top. A zone view only sees keys in its own subtree, so the root agent could read the list and the zone agent
  looking straight at it could not.

- 5f53462: A turn the provider cut off says so, instead of passing as a finished one

  `LlmTurnAnswer.stop` gains `"length"` — `finish_reason: "length"`, `stop_reason: "max_tokens"` — and it rides the
  wire and the `AgentStop` enum to the browser. It is not one provider's quirk: every adaptor here reports it,
  including the default, and only the shape of the union was hiding that.

  Without it a truncated answer arrived as `stop: "end"` and the user read half a sentence as the whole reply. Worse
  on an agent surface: a turn cut off mid tool call carries no complete call, so it ended the loop looking exactly
  like a model that had decided it was done — a hang the transcript explained as a choice. The session now records
  the turn as incomplete on the assistant message the user is reading, and closes any call the turn did make rather
  than running it, since a batch the model was interrupted inside is half an intention.

  The ceiling wins over the calls that did arrive, in both adaptors and on both the streamed and whole paths.

- 69f7178: feat: the in-page agent waits for the screen, aims its reads, points at things, and says what it is doing

  **A tool that changes the screen now waits for the screen before it answers.** `router.push` returns while the RSC
  payload for the new route is still in flight, so `navigate` used to report success onto a page that had not
  rendered yet: the `readScreen` in the same turn read the page the user had just left, and the new route's tools were
  not registered. `ScreenSettle.wait()` waits for DOM quiescence — bounded, and quiescence rather than a framework
  signal because the client router hands its promise to nobody and a change may land in the store, in a refetch, or
  in a streamed Suspense boundary. `navigate` awaits it, and `AgentSession` awaits it after every non-`query` tool
  before taking the change report, so an optimistic action that commits a tick later is reported as what it did
  rather than as the moment before it. Tools and state from a fresh route are still only listed from the next turn —
  the catalogue is snapshotted when a turn starts — and the navigate result says so.

  **`goBack` joins `navigate` as a global built-in.** It was briefly declared by `Link.Back`, which made it exist
  only where a back link happened to be rendered — but history is not a control a page owns: every route has a
  previous page, the browser's own gesture is always there, and a page that draws no back link is not a page you may
  not leave. It refuses at call time when nothing is behind the current page instead of walking out of the app.

  **`readScreen` takes a `section` and there is a new `highlight(target)`.** Both resolve a name the agent has
  already seen rather than a selector it invented: a `data-akan-action` / `data-akan-state` annotation (the one
  `readScreen` prints beside a control), an `Agent.Zone` or `useScreenScope` container, an element id, or a heading
  by its own text — matched on letters and digits, so the slug an agent writes for a heading it read resolves. That
  tolerance stops at headings: a heading is a landmark and scrolling to the wrong one costs nothing, while two
  buttons reading "Save" are not the same control. Nothing hidden resolves at all, because a ring nobody can see
  reads as a broken tool rather than as a miss. A name that resolves to nothing is the caller's mistake, with a
  refusal that lists the sections actually on screen.

  **A screen is only aimable if its names are printed**, which is what the first version got wrong: a page of twenty
  `Scroll.Slide` sections answered "nothing on this screen carries a name", because `readScreen` printed the heading
  text without its anchor and the truncation note stopped at a character count. Headings now carry `(#anchor)` when
  they open an id'd or scoped container, and a truncated read ends with the headings below the cut — otherwise
  everything past the 8000-character limit is unreachable, since nothing names it. `highlight` flashes **after the
  scroll lands**: a smooth scroll across a long page outlasts a flash begun at the top, which is the same bug wearing
  a different hat. `useScreenScope` now hands
  back its scope path and `Load.Units` / `Load.View` / `Data.ListContainer` put it on the container they render, so
  every list and detail view on an akan screen is addressable with no app code. `highlight` scrolls its target into
  view and flashes it on the app's own primary token: it is the one built-in that exists for the _user's_ benefit,
  because showing where a control is beats writing directions to it.

  **A slow tool can say what it is doing.** `AgentProgress.report(message, { done, total })` is the browser twin of
  `McpProgress.report` — reached through a module slot rather than a parameter, so work several frames down (a store
  action, an upload loop, an adapter) reports without every signature growing a channel argument, and a no-op when
  nobody is rendering it. The chat shows the report on that call's row until the row resolves. A session runs tool
  calls one at a time, which is why the browser needs no `AsyncLocalStorage` to do this.

  **The turn cap is a question instead of a dead end.** At `maxTurns` the session asks whether to keep going through
  the same card `askUser` uses, and the answer rides as the user's own turn — so a steer typed instead of the
  keep-going choice reaches the model as guidance rather than being swallowed. A host that renders no
  `pendingQuestion` passes no `continueAsk` and keeps the old failure, because asking with nobody listening would
  hang.

- 69f7178: feat: the in-page agent waits out long work instead of polling it, and Stop reaches a tool that is still running

  **An agent that started something slow had one way to learn it finished: ask again.** Every look is a full model
  round trip, so a two-minute video generation burned the default eight-turn budget in about twenty seconds and read
  to the user as check → wait → check → wait, forever. Two things change.

  **A tool that awaits its own work now holds the turn, with no model round trip in between.** This always worked —
  the session awaits `#execute` and `AgenticSurface.call` awaits `entry.run` — but nothing said so and nothing made
  it safe, so apps wrote fire-and-forget tools and left the agent to poll. The shape is one `st.tool` whose `.exec`
  awaits the store action that finishes the job; the change report that follows carries whatever landed while it
  waited, so the model needs no second call to read the result.

  **Stop now ends a turn parked inside a tool.** `AgentSession` passed its abort signal to the approval and question
  cards and nowhere else, so a call that took two minutes held the loop for two minutes after the user pressed Stop,
  with the chat still showing a turn in flight. Latent until now, and a certainty the moment a tool is allowed to
  wait. The session races every call against the signal, and hands the signal to the tool through `AgentAbort` — the
  module slot `AgentProgress` already is, for the same reason: work several frames down reads it without every
  signature between here and there growing an argument, and a session runs tool calls one at a time. Honouring it is
  optional, since the race lands whatever the tool does; what it buys is the tool's own cleanup, such as a timer that
  would otherwise tick out its whole timeout with nobody left to answer. A tool that ignores it is left running
  rather than cancelled — the work is usually a job a server is already doing, and throwing away a result that is
  about to land helps nobody.

  **`AgentAbort` and `AgentProgress` are re-exported from `akanjs/store`.** `AgentProgress` had no export path an app
  could legally use, `use-agentic` being a third-party import from `apps/**` and `libs/**`, so the documented advice
  to report progress from a slow tool was not followable. A tool that can neither report progress nor honour Stop is
  exactly the tool this release exists to make writable.

- 69f7178: feat: component-level in-page agent — a chat that reads the rendered screen and drives it

  The agent surface work so far described what an app _can_ do (the store catalogue, the MCP catalogue); this ships
  the half that knows what the _screen_ is doing and lets a user hand it the wheel. One mount —
  `<Agent.Chat />` in a layout — is the whole integration.

  **`use-agentic`** is the new framework-independent core: a mount-lifetime surface
  (`registerTool`/`registerResource`/`openScope`/`registerGuide`, name stacks where the newest registration wins and
  unregistering restores what it shadowed), hooks (`useAgentState`/`useAgentTool`/`useAgentResource`/`useAgentGuide`,
  declarations mount-static and behavior always-latest), and `AgentSession` — the client-side conversation loop:
  send → model turn → tool calls → approval gate → execute → report resource diffs → next turn. The loop lives in the
  browser because the tools do; the server is one stateless turn relay that never executes anything. Failures land in
  the transcript rather than being thrown past it. The wire is documented in `WIRE.md` so any backend can serve it.

  **The screen context is derived, not declared — and it follows the rendered screen, not the bundle.**
  `Load.Units`/`Load.View` register scopes and curated item lists as they mount (labels come from the `text: "title"`
  search role), `StoreInstance` counts which state keys the mounted components are reading — `st.use`, `st.sel`, and
  `st.ref` all count, the selector-based pair by running the selector once over a recording proxy — and a store's
  catalogued actions and state are published only while one of its keys is live. `AgentContext` assembles route +
  screen + live-state blocks per turn — primitives inline, everything else one masked `readState(key)` call away.
  `remove*` names default to a confirm gate, and the framework adds two built-ins beside `readState`: `navigate`
  (internal paths only, the same router `Link` rides) and `readScreen`, which serializes the rendered DOM into
  compact text — headings, links, control values with their `data-akan-*` annotations — so "what does this page
  say?" is answerable; the chat's own UI is skipped via `data-agent-ui` and a password value is never read.

  **Exposure is the store author's to trim.** `static agent = false` keeps a whole store off the surface — the
  framework's base store declares it, which also stops `readState` from reaching the `tryJwt` credential — and
  `static agent = { exclude: [...] }` withholds named actions and state keys; `st.use.x({ agent: false })`
  subscribes without counting toward liveness. Generated `set<Key>` conveniences are no longer published at all:
  they carried no schema, so they listed as zero-argument levers that wrote `undefined`.

  **`Agent.Chat`** is the user-facing half: launcher, transcript, composer, and the inline approval card, behind an
  `ssr: false` lazy boundary so none of it touches the server HTML, and re-skinnable through the `AgentChat`
  `_overrides.tsx` slot. Its default runner posts the wire to the app's own `runAgentTurn` route through
  `httpRunner`, which negotiates streaming via `accept`: the relay answers `text/event-stream` — one `RunnerEvent`
  per SSE `data:` line, assistant text arriving as it is generated — and a server that does not stream answers the
  same JSON turn. The endpoint reads the request with `.with(Req)` and returns a raw `Response` for the SSE half;
  `LlmAdaptor.chat` gained an optional `onDelta`, and an adapter that ignores it still answers whole. An app that
  mounts no relay degrades to a transcript message. `ThemeToggle` now publishes the current `theme` and a
  `setTheme` tool, so "switch to dark mode" works out of the box wherever it is mounted.
  A tool call is **one row** that resolves in place — pending, then `✓`/`✕` with the result's error or change count
  — rather than a badge on the assistant message and a second row for its result: the model needs both wire
  messages, but the user watched one thing happen, and the name appearing twice read as a doubled call. The row
  carries the call's arguments, because two searches are otherwise the same row twice.
  `<Agent.Guide instructions="..." />` layers route-scoped guidance by render position: nested Guides concatenate,
  navigation withdraws them. `prompt()` endpoints double as the chat's slash commands with no listing endpoint —
  the client reads its own serialized signals, and the prompt's GET enforces its guards at call time.

  **The relay is framework-embedded.** `runAgentTurn`, the `agentTurn` scalar, `AgentTurnStream`, and the
  `AgentRelayAccess` guard ship with `akanjs` itself, registered the way the `base` module is — every app serves the
  relay with no lib to mount, `AKAN_AGENT=false` takes it off, and a lib that still carries its own `agent` module
  wins the refName so older workspaces keep working. `OpenaiLlm` (chat-completions REST, zero SDK dependencies)
  is the predefined default behind a new `LlmAdaptorRole`; an app swaps providers in its `option.ts` with
  `applyAdaptor(LlmAdaptorRole, OwnLlm)` — the same builder family as `applyMiddleware`, and the override mechanism
  works for every predefined adaptor role. The endpoint stays outside MCP — its `Any` bodies are refused from the
  catalogue — and `AgentRelayAccess` defaults to allow but now **warns at boot while no policy is registered**; a
  policy that throws fails closed.

  **An app configures its server in `lib/option.ts`, not through the environment and not in `main.ts`.** `AkanOption`
  gained three setters, each read from every lib in mount order with the app's own last, so an app tightens what a
  library declared without restating it. `setLlm({ apiKey, model, host })` — or `setLlm((options) => …)` to take the
  key out of the app's own gitignored env object — reaches whichever adaptor holds `LlmAdaptorRole` as the
  `llmOption` use, replacing the per-provider environment names; the settings belong to the role
  rather than to one provider, so they survive a swap. `setAgentAccess(SignedIn)` names the guards
  `AgentRelayAccess` forwards to, which `AgentRelayAccess.use` takes at boot. `setMcp({ … })` carries the MCP server
  settings that `new AkanApp("./server", { mcp })` used to spell as child environment variables — the gateway there
  only spawns children, while `option.ts` is already handed to the process that mounts `/mcp`, so `AkanAppOptions.mcp`
  is gone. Every `AKAN_MCP_*` env spelling still works for a deployment configuring what the source does not, and an
  option written in code still wins over the env of the same name.

  **`<Agent.Zone id="comments">` runs a second agent over one section, in parallel with the root.** Zones are views
  of the same surface, never walls: everything mounted inside — `st.use` subscriptions (liveness is now tagged with
  the ambient scope), hook tools, guides — belongs to the zone's own conversation _and_ stays visible to the root
  agent, so wrapping a section costs the root nothing. An `Agent.Chat` inside binds to the zone session
  automatically, a zone's `readScreen` reads only its own `data-agent-zone` container, and guides follow the layout
  cascade — ancestors and own, never a sibling's. The core grew `surface.view(path)` (`SurfaceView`), and
  `AgentSession` now runs over any view.

  **`persist` keeps the transcript across reloads.** Off by default; `<Agent.Chat persist />` stores settled
  messages in sessionStorage (per-tab, gone when the tab closes), `{ storage: "local" }` outlives it, and each
  `Agent.Zone persist` keys its own entry by scope path. Restores drop the assistant draft a reload cut short,
  saves are debounced against streaming deltas, a versioned envelope discards stale wire shapes, only the newest 50
  messages are kept, and a full or blocked storage never breaks the chat. The chat header gained a clear button
  that empties both the transcript and the stored copy.

- 5f53462: feat: the agent's pointer lives for the turn, and waits out the model's own thinking

  The pointer's life was measured in the gap between **calls** — 1.4 seconds of quiet and it faded. But a model's
  calls arrive with its own writing between them, which takes several seconds, so a turn of four calls was four
  pointers: each one appeared, pressed, and vanished before the next arrived. The unit was wrong.

  `AgentSession` now reports the boundary that matters. `onTurn(running)` fires once when a turn starts and once
  when it settles, and only the conversation loop reports there: `compact` runs under the same internal flag and
  drives nothing on screen, so a host drawing the agent at work would otherwise draw it for a summary nobody asked
  to watch. Between the calls of one turn the pointer stays where it last landed and turns into a spinner, because a
  pointer sitting perfectly still for four seconds reads as stuck rather than as waiting.

  It still appears only at the first control it presses, and **a turn that drove no control draws no pointer at
  all** — parking one in a corner for a turn that only answered a question would be the screen claiming something
  that did not happen.

  While a reveal scrolls the page to the next control, the pointer holds still the way a person's does and carries a
  chevron pointing the way the view is travelling — stillness over a sliding page otherwise reads as a pointer that
  has come loose rather than as the one doing the scrolling. The scroll budget is now spent per turn as well, instead
  of per quiet second, which is what it was always guessing at.

  **`navigate` draws again, but only on an element.** The link a navigation is going to, when exactly one visible
  link goes there, is pressed before the route moves — which needs the call to wait, so `ToolRunner` now awaits the
  `start` activity and `AgentSession.onActivity` may answer a promise. `AgentVisual` returns one for that call alone
  and caps it at 600ms; everything else still draws while the call is already running. An off-screen link is left
  alone, because scrolling to a link and then leaving the page it is on is two motions for one act. **Link presence
  decides what is drawn, never what is allowed**: the agent may still navigate anywhere the user could type, and a
  zone that must stay on one screen drops `navigate` through `builtins` as before.

  `Router.routeOf(pathname)` is what compares the two addresses — the locale and base-path segments live on the
  `<a href>` and never on the tool argument. It is `getPath` without the browser guard, which `getPath` only needs
  for its own default argument.

  **The pointer clears the control before it waits.** A spinner parked on the button it just pressed reads as one
  stuck to it, and it covers the very change the press caused — a person clicks and takes the hand away. It drifts
  just past the control's box, down and to the right unless the viewport edge is there, and spins from that spot.

  **A control the screen is not actually showing is not pointed at, and the pointer goes rather than travelling to
  it.** `checkVisibility` answers about an element alone, so one under a modal's backdrop, inside a drawer that has
  slid off, or faded to nothing all pass it while being invisible to the user — and a pointer sent there lands on a
  blank patch of overlay, which reads as the effect being broken rather than as the agent acting. The test is
  `elementFromPoint` at the control's own centre, taken after the reveal has settled, with an ancestor counting as a
  hit so a `<label>` wrapping its input is not mistaken for an occlusion.

  **`agentAttrs(handler, key)` tells namesakes apart.** One tool serves a whole tab strip or a whole list, so every
  control carrying it was interchangeable in the DOM and the no-guessing rule turned that into drawing nothing.
  A key — in the same vocabulary the call's argument uses — lets the pointer pick the one the call named; short of
  exactly one answer nothing is still drawn. `Tab.Menu` now passes its own `menu` key, so switching a tab is drawn
  on the menu that was switched to.

  `reveal` and `cursor` are now independent, as their names always claimed: `visual={{ reveal: false }}` keeps the
  pointer and drops the ring, where before it dropped both.

- 2d8de1c: fix: the `use-agentic` entry is no longer marked `"use client"`

  The entry re-exports every module with `export *`, and a client boundary cannot re-export that way — its export names
  must be visible to the bundler. Every module that needs the client already carries its own `"use client"`, while
  `AgentSession`, `httpRunner` and `Reference` are server-safe and are used on the server, so the directive on the entry
  only claimed a boundary it did not draw. Nothing an importer receives changes.
