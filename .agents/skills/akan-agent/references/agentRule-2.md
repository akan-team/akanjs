<!-- akan:generated -->

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
  `data-akan-action` like a store setter does. A `remove*` name defaults to a confirm gate. `st.tool("x", { label:
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
- **A shell's `submit<Model>` refuses while an upload is in flight.** `Model.EditModal` (also while its submit is
  disabled) and `Model.ViewEditModal` disable the button and answer `The <model> form is not ready to submit.` while
  `<model>FormUploading` is not empty. That key is read `{ agent: false }`, so the refusal is how an agent learns of
  the upload: call `submit<Model>` again once the file has landed, rather than setting the field a second time.

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
