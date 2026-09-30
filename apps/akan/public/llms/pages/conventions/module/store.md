# model.store.ts

- Source: /conventions/module/store
- Mirror: /llms/pages/conventions/module/store.md
- Section: conventions
- Category: Domain
- Priority: P1

## Headings

- model.store.ts (#store-overview)
- Store Class Structure (#class-structure)
- Extending Library Stores (#generated-extension)
- Writable And Derived State (#writable-derived-state)
- Reading And Writing State (#state-management)
- Standard Model API (#standard-api)
- Generated Slice API (#slice-features)
- Usage Patterns (#usage-patterns)
- Rules And Common Mistakes (#practical-rules)

## Content

model.store.ts

`<root>` for the root slice, `<named>` for inProject.

`<model>.store.ts` holds one module's client state and the actions that change it. Pages and components read state from the store and call its actions; they never coordinate `fetch` calls themselves.

Most stores stay nearly empty, because a model store generates its state and CRUD actions. Write an action by hand only for one of these:

A Toast

Loading and success messages around a custom endpoint call.

An Optimistic Update

Change the client model first, send the request without waiting, then commit.

A Multi-Field Write

Several state keys that must change together in one write.

What the store owns

The work

store — *.store.ts

Other layers — constant · document · service · signal

- UI orchestration

  - fetch.*: Calling the server and tracking its loading state.

  - msg.*: Toast messages around a call: loading, success, error.

  - modal · selection: Which modal is open and which rows are selected.

  - form · list: Form values and loaded lists. A model store generates both.

  - router.push: Client navigation after an action succeeds.

- Business rules

  - domain rule: Validation and state transitions live in constant, document and service.

  - access check: Who may call an endpoint is decided by its guards in the signal.

Belongs here

Not here

Words used on this page

Term

- state: A value the store holds. A component re-renders when a key it reads changes.

- action: A method of the store class. Components call it through `st.do.<action>()`.

- st: The app's root store, merged from every module store. Import it from `@apps/<app>/client`.

- slice: A list query declared in `<model>.signal.ts`. Each one gets its own list state and actions.

- DataList: The id-indexed list type that slice state uses. Update it with `list.set(x).save()`.

Store Class Structure

A store is a class that extends `store(…)`. The first argument decides which of two kinds it is:

Model Store

Bound to a model's signal. It gets the model, form and list state and the CRUD actions.

Service Store

No signal. It holds only the state and actions you write.

Argument

- sig.<model>: Binds a model and generates its state and actions. A service store passes `"<name>" as const`.

- () => ({ … }): Required. The state factory; its defaults are recreated for each store instance.

- ({ search, computed }) => ({ … }): Optional. Read-only derived state, covered under Writable And Derived State.

- ...<model>.stores: Optional. Library stores for the same model, merged in first.

A model store with one custom action, complete with its imports:

**Imports come from the module's own barrels.** `fetch`, `msg` and `sig` from `../useClient`, model classes from `../cnst`.

**An action body is about three lines:** `await fetch.x()`, a generated setter such as `this.setTicket()`, then the toast.

**`msg` takes a dictionary key,** and the shared `key` option lets the success toast replace the loading one.

A service store starts from the same scaffold. Keep the `// state` and `// action` markers even while it is empty:

Extending Library Stores

When an app has a module that a library also has, such as `user` from `libs/shared`, the app store extends the library's. List the library stores after the state factory:

**`../__lib/lib.store` lists them for you.** It exports `<model>.stores` for every model a library you use also has a store for.

**The library comes first.** Its state and actions are merged in, then the app adds its own state and actions on top.

**A derived-state factory goes before them.** The order is `store(sig.user, state, derived, ...user.stores)`.

Writable And Derived State

Most state is a plain value. The state factory also offers `persist` and `session` to keep a value in browser storage, and an optional third argument declares read-only state with `search` and `computed`:

Declared as

- menuOpen: false: A plain value in memory that resets with the store. For ordinary UI state.

- persist(Type, options?): Kept in `localStorage`. For values that must survive a reload.

- session(Type, options?): Kept in `sessionStorage`. For values needed only in the current browser session.

- search(paramKey, Type, options?): Read-only, parsed from the URL query string. For filters and tabs a link should carry.

- computed(deps, selector, options?): Read-only, recomputed when a writable key in `deps` changes.

Builder options

- default (T | () => T, persist, session, search): Starting value. Without it: `[]` for arrays, the first enum value, else the type's own default.

- nullable (boolean, default false, persist, session, search): Allows `null`, and starts at `null` when no default is given.

- key (string, default the state key, persist, session): Name used in browser storage.

- equals ((a, b) => boolean, default Object.is, computed): Decides whether a recomputed value counts as a change.

**`computed` reads writable keys only.** Every name in `deps` must be a writable key of the same store, generated keys such as `ticketForm` included, and never another `search` or `computed` key.

**`search` falls back to its default.** A missing, empty or unparsable parameter reads as the default, and so does every server render.

**Derived state is read-only.** `this.set({ … })` on a `search` or `computed` key throws, and no `set<Key>` setter is generated for it. Change the URL or the writable keys it reads instead.

Reading And Writing State

Inside an action, three methods on `this` cover every read and write. Use `pick` when the next line cannot work without the value:

Method

- get(): Returns the current state. Use it when a value may be `null`. — Example: `const { ticket, ticketList } = this.get();`

- pick(...keys): Returns required keys; throws if one is `null`, `undefined` or `""`. — Example: `const { ticketForm } = this.pick("ticketForm");`

- set(state): Writes state. An object merges shallowly; a function mutates an immer copy in place.

**`pick` throws on a missing value.** When `null` is a valid branch you want to handle, read with `get` and return early.

Standard Model API

A store bound to `sig.<model>` gets the state and actions below without writing them. Each name uses the model name: for `ticket`, `<model>Form` is `ticketForm` and `create<Model>` is `createTicket`.

Base state

Field

- <model>: Full | null: The full model currently open, such as `ticket`. `null` until one is loaded.

- <model>Loading: string | boolean: `true` at first, `true` or the record id while a request runs, then `false`.

- <model>Form: DefaultOf<Full>: Form values for creating or editing one record.

- <model>FormLoading: string | boolean: `true` until a form opens, the id while `edit<Model>` loads, then `false`.

- <model>Submit: Submit: `{ disabled, loading, times }` for the submit button.

- <model>ViewAt: Date: When `<model>` was last loaded or saved.

- <model>Modal: string | null: Which modal is open: `"edit"`, `"view"`, your own key, or `null`.

- <model>FormDraft: DraftState | null: The open form's unsaved draft. `Load.Edit`, `Model.EditModal` and `Model.New` manage it.

Base actions

- create<Model>InForm(options?): Creates from `<model>Form`, resets the form and adds the row to the list.

- update<Model>InForm(options?): Saves `<model>Form` over its record, resets the form and patches loaded lists.

- create<Model>(data, options?): Creates a record from `data`; the form is untouched.

- update<Model>(id, data, options?): Updates one record from `data`; the form is untouched.

- remove<Model>(id, options?): Removes a record and drops it from every loaded list.

- check<Model>Submitable(disabled?): Sets `<model>Submit.disabled` from whether the form is valid.

- submit<Model>(options?): Calls `update<Model>InForm` when the form has an id, else `create<Model>InForm`.

- new<Model>(partial?, options?): Fills the form for a new record and opens the `"edit"` modal.

- edit<Model>(modelOrId, options?): Loads the record into the form and opens the `"edit"` modal.

- merge<Model>(modelOrId, data, options?): Saves `data` through the update endpoint and patches the cached copies.

- view<Model>(modelOrId, options?): Loads the record into `<model>` and opens the `"view"` modal.

- set<Model>(...models): Writes returned models into `<model>` and into loaded lists that hold them.

- reset<Model>(model?): Clears `<model>` or sets the one given, resets the form and closes the modal.

- load<Model>FormDraft, restore<Model>FormDraft, discard<Model>FormDraft: Drive the form draft. `Load.Edit`, `Model.EditModal` and `Model.New` call them for you.

`create<Model>…`, `update<Model>…` and `submit<Model>` take the same options:

- onSuccess ((model) => void | Promise<void>): Runs after the save with the saved model, e.g. to navigate.

- onError ((error: string) => void): Runs when the request fails.

- modal (string, default null): Modal to show after saving. Left out, the modal closes.

- sliceName (string, default <model>): Slice whose list receives a created row, such as `ticketInProject`.

- path (string): Also writes the saved model into this state key.

Form setters

Every field of the model also gets setters that write into `<model>Form`. The array and `File` rows appear only for fields of that type:

- set<Field>On<Model>(value): Writes one field of `<model>Form`. Pass it to `onChange` by reference.

- add<Field>On<Model>(value, { idx?, limit? }): Array field: inserts one or more items at `idx`, at the end by default.

- sub<Field>On<Model>(idx): Array field: removes the item at `idx`, or at every index in an array.

- addOrSub<Field>On<Model>(value): Array field: adds the value if absent, removes it if present.

- upload<Field>On<Model>(fileList, idx?): `File` field: uploads, then polls until the file leaves `uploading`.

- writeOn<Model>(path, value): Writes a nested path, such as `"payments.3.name"`.

To react when a field changes, declare `_postSet<Field>` on the store. It runs after every write of that field:

**Pass setters by reference.** `onChange={st.do.setTitleOnTicket}` lets the control publish the field to agents and tests; an inline arrow does not.

**`_postSet<Field>` fires for every writer** — the person's control, an agent's tool, or `fill<Model>Form` — so the rule holds on every screen.

Generated Slice API

Each slice declared in `<model>.signal.ts` gets its own list state and actions for paging, sorting, selection and counts. This slice is named `inProject`:

The slice name becomes a suffix. The root slice that every model has adds nothing, and `inProject` adds `InProject`:

Pattern

Slice state

- <model>List<Suffix>: DataList<Light>: Rows on screen, loaded by init, refresh or paging.

- <model>ListLoading<Suffix>: boolean: Whether the list is loading.

- <model>InitList<Suffix>: DataList<Light>: Rows from the last init or refresh.

- <model>InitAt<Suffix>: Date: When the list was last initialized.

- <model>Selection<Suffix>: DataList<Light>: Rows the user selected.

- <model>Insight<Suffix>: Insight: Aggregates for the query, such as `count`.

- default<Model><Suffix>: DefaultOf<Full>: Starting values for a new form opened from this slice.

- pageOf<Model><Suffix>: number: Current page, starting at 1.

- lastPageOf<Model><Suffix>: number: Total number of pages, computed from `count` and the limit.

- limitOf<Model><Suffix>: number: Rows per page, 20 by default.

- hasMoreOf<Model><Suffix>: boolean: Whether the server holds rows past the ones loaded. Read this, not the count.

- isCumulativeOf<Model><Suffix>: boolean: `true` after `loadMoreOf…`: the list accumulates instead of paging.

- queryArgsOf<Model><Suffix>: Args: Current query arguments.

- sortOf<Model><Suffix>: Sort: Current sort key, `"latest"` by default.

Slice actions

- init<Model><Suffix>(...args, initForm?): Loads the list for these query args. Skips the request if that query is loaded.

- refresh<Model><Suffix>(initForm?): Refetches the current list from the server.

- select<Model><Suffix>(light | light[], { refresh?, remove? }): Adds to the selection; `refresh` replaces it, `remove` takes rows out.

- setPageOf<Model><Suffix>(page, options?): Swaps the list to that page.

- loadMoreOf<Model><Suffix>(options?): Appends the rows after the ones loaded. Takes no page number.

- setLimitOf<Model><Suffix>(limit, options?): Changes rows per page and reloads.

- setQueryArgsOf<Model><Suffix>(...args): Changes the query args and reloads. Also takes `(prev) => next`.

- setSortOf<Model><Suffix>(sort, options?): Changes the sort and reloads.

`init<Model><Suffix>` and `refresh<Model><Suffix>` take an optional `initForm` last:

- page (number, default current, 1 at first): Page to load.

- limit (number, default current, 20 at first): Rows per page.

- sort (string, default current, "latest" at first): A sort key the filter declares.

- insight (boolean, default true): `false` skips the count query; the count becomes the rows loaded.

- default (Partial<DefaultOf<Input>>): Starting values `new<Model>` fills a new form with.

- invalidate (boolean, init: false, refresh: true): `true` always refetches; `false` reuses an identical query already loaded.

- queryArgs (Args, refresh): Replaces the leading query args; the rest keep their current values.

Usage Patterns

Inside a store action, handle state through `this` — `get`, `pick`, `set` and the generated actions — and call the server with `fetch`:

**Generated actions are on `this` too.** `this.selectTicketInProject([], { refresh: true })` clears the selection exactly as `st.do` would.

**A `DataList` maps like an array.** `ticketSelectionInProject.map(…)` returns a plain array, here of ids.

In a component, read with `st.use.<key>()` and call actions with `st.do.<action>()`:

**`st.use.<key>()` subscribes to one key.** The button re-renders only when `ticket` changes, not on every store write.

**`void` marks a call you do not await.** An `st.do` action returns a promise, and a thrown `Err` is already shown as a toast.

Generated setters

Every plain state key also gets `st.do.set<Key>(value)`. These two lines do the same thing:

**An action with the same name wins.** `setTicket` is the generated `set<Model>` action and `setPageOfTicket` is a slice action, so neither is a plain setter.

**Derived keys get no setter.** `search` and `computed` state is read-only.

Rules And Common Mistakes

Check a store against these rules before you commit it:

**Return nothing from an action.** Every action is dispatched through `st.do`, so a returned value is unreachable. Write the result into state with `this.set()`; a bare `return;` guard is fine.

**Update lists through the DataList API.** Write `this.set({ ticketList: ticketList.set(ticket).save() })`, not an array spread.

**Use generated actions after a mutation.** `this.setTicket(await fetch.x())` updates the open model and every loaded list that holds the row.

**No `try/catch` in an action.** A thrown `Err` is shown as a toast for you. For a client-side check, call `msg.error("<key>")` and return early instead of throwing.

**Use `pick` for required state, `get` when `null` is a valid branch.** See Reading And Writing State.

**Extend a library store before adding your own.** Pass `...<model>.stores` to `store()`, then add app-specific state and actions.

Reaching Another Store

To call another store's action or touch its state, type `this` as `RootStore`:

**The cast only tells the type what is already there.** Every store is mixed into one root at runtime, so `(this as unknown as RootStore)` can call any action and `.set({ … })` / `.get()` any state.

**Keep it `import type`.** `st.ts` imports every store, so a value import from it is a cycle.

## Code Examples

### apps/koyo/lib/ticket/ticket.store.ts

```ts
import type { Dayjs } from "akanjs/base";
import { store } from "akanjs/store";

import * as cnst from "../cnst";
import { fetch, msg, sig } from "../useClient";

export class TicketStore extends store(sig.ticket, () => ({
  backlogTicketList: [] as cnst.LightTicket[],
})) {
  async openTicket(id: string, due: Dayjs) {
    msg.loading("ticket.openTicketLoading", { key: "openTicket" });
    this.setTicket(await fetch.openTicket(id, due));
    msg.success("ticket.openTicketSuccess", { key: "openTicket" });
    this.set({ ticketModal: null });
  }
}
```

### apps/myapp/lib/_myapp/myapp.store.ts

```ts
import { store } from "akanjs/store";

export class MyappStore extends store("myapp" as const, () => ({
  // state
  menuOpen: false,
})) {
  // action
}
```

### apps/koyo/lib/user/user.store.ts

```ts
import { store } from "akanjs/store";

import { user } from "../__lib/lib.store";
import * as cnst from "../cnst";
import { fetch, sig } from "../useClient";

export class UserStore extends store(
  sig.user,
  () => ({
    self: new cnst.User(),
  }),
  ...user.stores,
) {
  async refreshSelf() {
    const { self } = this.get();
    this.set({ self: await fetch.user(self.id) });
  }
}
```

### apps/koyo/lib/ticket/ticket.store.ts

```ts
export class TicketStore extends store(
  sig.ticket,
  ({ persist, session }) => ({
    viewMode: persist(String, { default: "board" }),
    draftKeyword: session(String, { default: "" }),
  }),
  ({ search, computed }) => ({
    status: search("status", cnst.TicketStatus, { default: "active" }),
    hasKeyword: computed(["draftKeyword"], (keyword) => keyword.length > 0),
  }),
) {}
```

### set(state)

```ts
this.set({ ticketModal: null });
this.set((state) => { state.ticketForm.title = ""; });
```

### apps/koyo/lib/ticket/ticket.store.ts

```ts
export class TicketStore extends store(sig.ticket, () => ({
  // state
})) {
  _postSetStatus(status: cnst.TicketStatus["value"]) {
    if (status === "done") this.setClosedAtOnTicket(dayjs());
  }
}
```

### apps/koyo/lib/ticket/ticket.signal.ts

```ts
export class TicketSlice extends slice(
  srv.ticket,
  { guards: { root: Admin, get: User, cru: User } },
  (init) => ({
    inProject: init({ guards: [User] })
      .param("projectId", ID)
      .exec(function (projectId) {
        return this.ticketService.queryInProject(projectId);
      }),
  }),
) {}
```

### apps/koyo/lib/ticket/ticket.store.ts

```ts
async archiveTicketMany() {
  const { ticketSelectionInProject } = this.get();
  const ticketIds = ticketSelectionInProject.map((ticket) => ticket.id);
  await fetch.archiveTicketMany(ticketIds);
  this.selectTicketInProject([], { refresh: true });
}
```

### apps/koyo/lib/ticket/Ticket.Util.tsx

```ts
"use client";
import { st, usePage } from "@apps/koyo/client";
import { dayjs } from "akanjs/base";

interface OpenProps {
  className?: string;
}
export const Open = ({ className }: OpenProps) => {
  const { l } = usePage();
  const ticket = st.use.ticket();
  if (!ticket) return null;
  return (
    <button
      className={className}
      onClick={() => void st.do.openTicket(ticket.id, dayjs().add(7, "day"))}
    >
      {l("ticket.openTicket")}
    </button>
  );
};
```

### apps/koyo/lib/ticket/Ticket.Util.tsx

```ts
st.do.setTicketModal(null);
st.set({ ticketModal: null });
```

### libs/shared/lib/user/user.store.ts

```ts
import { router } from "akanjs/client";
import { store } from "akanjs/store";

import * as cnst from "../cnst";
import type { RootStore } from "../st";
import { fetch, sig } from "../useClient";

export class UserStore extends store(sig.user, () => ({
  self: new cnst.User(),
})) {
  async removeSelf({ redirect }: { redirect?: string }) {
    const { self } = this.get();
    if (!self.id) return;
    await fetch.removeUser(self.id);
    await (this as unknown as RootStore).logout();
    if (redirect) router.push(redirect);
    else router.refresh();
  }
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

