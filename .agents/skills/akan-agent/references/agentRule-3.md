<!-- akan:generated -->

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
- **A failed turn keeps its code for the host.** The relay's `error` event carries `code`: the `Err`'s key, else
  an `AkanError`'s own code, else the status's name, and always the status's name for a refusal (401/403). A
  refusal the guard answers before the stream opens is named by its body's code, else its status. The chat keeps it
  on that assistant message as `errorCode` after translating the text, so a host branches on `message.errorCode`,
  never on the sentence. It is never sent back to the relay.
- **↑ and ↓ in the composer walk what was sent**, seeded from the transcript so a persisted chat does not lose
  only what was just typed. A single-line input has nothing of its own on the vertical arrows, and the
  half-written draft they were walked away from comes back at the bottom of the walk. **The `/` menu takes those
  keys while it is open** — it is the thing on screen the arrows point at — with Enter picking the highlighted
  row, Tab completing its name, and Escape closing the menu and then, pressed again, the panel.

## Built-In Tools
- The framework publishes six built-ins on every store surface: `navigate` (internal paths only, the same router
  `Link` rides, so the app's navigation guards are asked and a refusal is reported as a kept page), `goBack` (this session's history — global, because history is not a control a page owns and a page
  that draws no back link is not one you may not leave — a screen that must not be left withholds them with `builtins`,
  not with prose), `readScreen` (the rendered DOM as compact text — headings, links, control values, and `(disabled)`
  on a control or button that has it; the chat's own UI is skipped via `data-agent-ui`, and a password value is never
  read), `readState(key)` (one masked store key — a key that is unknown or that this screen does not read is refused
  *with the keys it can* read, the way `readScreen` names its sections), `highlight(target)`, and `viewImage(src)` (one
  `<img>` on screen, redrawn as a JPEG at most 1568px long and attached to the result — `src` must be one this view
  shows, as `readScreen({ images: true })` printed it, so the agent cannot have the browser fetch an address of its
  own, and a `data:` one is refused). Declaring a hook tool under one of those names shadows the built-in, so reuse
  them only to mean that. **There is no general-purpose wait**:
  a built-in one was reachable on every screen and a model spent it on whatever key it liked, parking turns nobody
  asked to park. Waiting belongs to the screen that knows what is worth waiting for — publish an `st.tool` beside the
  control that starts the work, and let it await the work.
- **A tool that changes the screen waits for the screen before it answers.** `router.push` returns while the RSC
  payload is still in flight and a store action that fires `void fetch.*` commits a tick later, so `navigate`
  awaits `ScreenSettle.wait()` — DOM quiescence, bounded, because the client router hands its promise to nobody —
  and the session awaits it after every tool that did not declare `settle: false` before taking the change report.
  Without it the report describes the moment before the change landed and the `readScreen` that follows reads the
  page the user left. The reading built-ins (`readScreen`, `readState`, `highlight`, `viewImage`) declare it,
  because a wait costs 120ms of quiet at the very least and they change nothing a resource holds.
  New tools and state from a fresh route are still only listed from the next turn: the catalogue is snapshotted
  when the turn starts. **So a navigation ends the model's turn, and a name nobody listed is answered with the names
  that exist.** A call is looked up when it runs, so one batched behind `navigate` already reaches the new screen —
  but the model wrote it against the old catalogue, and a screen-scoped name it never saw is one it composed
  (`addBacklogTicketInProject` for `addBacklogTicket`), and refused with a bare `Unknown tool` it composes the next.
  `AgentService.preamble` therefore says that a navigation ends the turn and that names are never guessed, and the
  session answers an unknown name with the tools listed now — saying, when the catalogue moved since the turn's
  list was written, that the call was written against the screen it left and the new one's tools arrive with their
  arguments next turn. `navigate`'s own answer says the same, reports the path the page actually landed on when a
  redirect or the not-found page moved it elsewhere, and a path with no route is refused with the internal links on
  screen (`ScreenTarget.linkedRoutes`) rather than an invitation to compose another. Layout-level tools — a channel
  post, a new wiki page — stay listed across routes, which is why the cross-screen requests that use only them never
  hit this.
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
  support. `readScreen({ images: true })` appends `(<src>)` to each, for handing one to `viewImage` or another tool
  that takes a picture; it is off by default because a gallery is one long URL per thumbnail, which is the read's whole budget
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
  `field.visual` one layer up — cost, not secrecy. Secrecy is `data-agent-private="<label>"`: the read prints
  `[private: <label>]` in its place even when asked for by name, and it is no `section` or `highlight` target. A
  password, one-time-code or card input (its standard `autocomplete`) is never read either; any other value on
  screen is.
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
