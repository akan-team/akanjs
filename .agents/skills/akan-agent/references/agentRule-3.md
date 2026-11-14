<!-- akan:generated -->

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

## Reading State
- **Reading is per key, not per store.** `st.expose(name, Type).desc("…").value(v)` publishes a derived value and
  `st.useState(name, Type, { set: true }).desc("…").init(initial)` local state, read-only without `set`. Both
  end in a hook, so a conditional surface withholds the name rather than skipping the chain. A subscribed store key is listed in
  the state context block by name and pulled with `readState(key)`, masked by the model that key declares — while
  a key the screen does not read stays unreadable even when a sibling key of the same store is live. **The block
  carries a value only when it is an id, an enum member, a number or a boolean**: a string rides inline when it is
  one token of up to 40 letters, digits, `.`, `_` or `-`, of at most three words — a word ends at a separator or
  at a lower-to-upper case change, so `created-at-desc` and `createdAtDesc` pass and four joined words are a
  sentence; more parts pass only as an id's, each hex with a digit or eight characters long, as in a UUID; a run of
  over sixteen letters with no digit never passes — and any other string is listed by key and type alone, because
  free text is whatever the record's author wrote and the model reads that through `readState`, where it arrives as
  page content. The route block follows the same rule for each path segment and path param, up to twelve words of
  each. **A search param rides inline when a store declares its key with `search("key", …)`** and its value is a
  token; of the others at most four ride, key and value both tokens, and the rest are left out, key and value, with
  their count in `searchParamsWithheld`. A page's own typed `search` is read on the server and does not count, so
  declare the params an agent should see in a store. What is left out is named in `withheld` as `pathname`,
  `params` or `searchParams`, and `readState` answers those three whether or not a component subscribes them. The
  screen block applies the rule to a `Load` scope's label, which is its record's title, and to the ids and labels
  of a list scope's `items` — a row whose id is not a token, a slug or a mixed-case random id, is left out — and
  then says to read the scope with `readScreen`. So instructions never say "the query is in the route context";
  they say to read `searchParams`. **Three things still ride whole, because no read returns them**: an
  `Agent.Zone`'s `label` and a value published with `st.expose`, `st.useState` or `useAgentResource`. Publish an
  id, a count or an enum member there, never text a user wrote. **There is no
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
