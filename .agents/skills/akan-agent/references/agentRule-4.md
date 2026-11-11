<!-- akan:generated -->

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
  `<button type="button" {...agentAttrs(run)} onClick={run}>`, where `run` is what `st.tool(…).exec(…)` returned.
  It reads the name off the callable, so there is nothing to keep in sync and no `ref` to thread — and it earns the
  same E2E selector and accessibility name an `akanjs/ui` control has. Never hand-write `data-akan-*`.
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
