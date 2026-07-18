# model.store.ts

- Source: /conventions/module/store
- Mirror: /llms/pages/conventions/module/store.md
- Section: conventions
- Category: Domain
- Priority: P1

## Headings

- model.store.ts (#store-overview)
- Store Class Structure (#class-structure)
- Extending Generated Stores (#generated-extension)
- Writable And Derived State (#writable-derived-state)
- State Interaction (#state-management)
- Standard Model API (#standard-api)
- Slice Auto-Generated Features (#slice-features)
- Usage Patterns (#usage-patterns)
- Other Stores With RootStore (#rootstore-access)
- Practical Rules (#practical-rules)

## Content

model.store.ts

Get the current snapshot of the store state.

Update store state. It merges shallowly.

Select required state values. It throws immediately if any requested key is null or undefined.

A store file is the client-side state and action layer for a module. Pages and UI components read state from the store and call store actions instead of coordinating fetch calls directly.

Stores sit between UI and generated fetch/sig clients. Service and document files keep business rules; store files handle UI state, form state, list state, toast messages, and client navigation around those calls.

Store Class Structure

Define a store with store(sig.model, stateFactory). The second argument is a factory, so default state is recreated safely for each runtime instance.

Extending Generated Stores

When an app extends a generated or library domain, pass the generated stores after local state. The inherited state, actions, and metadata are merged first, then the app adds its own state and actions.

Writable And Derived State

Most stores only need plain writable state. The state builder also supports persist and session values. A third store() argument can define derived state such as URL search params or computed values.

Use normal values for UI state that can reset with the store.

Use for values that should survive browser reloads.

Use for values that should last only during the current browser session.

Use for URL-backed state or values derived from writable state.

State Interaction

Inside a store action, use get for optional reads, pick for required state, and set for updates. pick is useful when the next line cannot work without that state.

pick throws if the requested value is null or undefined. Use get when null is a valid branch you want to handle manually.

Standard Model API

A store bound to sig.model receives generated model state and generated CRUD/form actions. These helpers cover common create, update, remove, view, edit, submit, and cache flows.

Slice Auto-Generated Features

Slice state and actions are generated from slices declared in model.signal.ts. Use them for list pages, pagination, sorting, selection, and insight state.

Usage Patterns

Use this.get, this.pick, this.set, generated fetch clients, and generated setters inside store actions. In React components, read with st.use and call actions with st.do.

Auto-Generated Setters

Other Stores With RootStore

Store instances are merged into one app-level RootStore type. Use RootStore casting only for rare cross-store coordination, because broad cross-store coupling makes actions harder to reason about.

Practical Rules

Keep UI orchestration in store: fetch calls, loading state, toast messages, modal state, and navigation.

Keep pure business rules in constants, documents, services, or signals instead of store actions.

Use pick for required state and get when null is a valid branch.

Use generated fetch clients inside store actions and generated setters like this.setTicket after successful mutations.

Extend generated or library stores with ...model.stores before adding app-specific state and actions.

Use RootStore casting sparingly for cross-store coordination.

## Code Examples

### ticket.store.ts

```ts
import { msg } from "@apps/akan/client";
import { store } from "akanjs/store";

import * as cnst from "../cnst";
import { fetch, sig } from "../useClient";

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

### service-only store

```ts
export class MyappStore extends store("myapp" as const, () => ({
  menuOpen: false,
})) {}
```

### user.store.ts

```ts
import { user } from "../__lib/lib.store";

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

### store state builders

```ts
export class TicketStore extends store(
  sig.ticket,
  ({ persist, session }) => ({
    viewMode: persist(String, { default: "board" }),
    draftKeyword: session(String, { default: "" }),
  }),
  ({ search, computed }) => ({
    status: search("status", TicketStatus, { default: "active" }),
    hasKeyword: computed(["draftKeyword"], (keyword) => keyword.length > 0),
  }),
) {}
```

### ticket.signal.ts

```ts
export class TicketSlice extends slice(srv.ticket, { guards: { root: User } }, (init) => ({
  inProject: init()
    .param("projectId", ID)
    .exec(function (projectId) {
      return this.ticketService.queryInProject(projectId);
    }),
})) {}
```

### Inside store

```ts
async archiveTicketMany() {
  const { ticketList } = this.get();
  await fetch.archiveTicketMany(ticketList.map((ticket) => ticket.id));
  this.set({ completeTicketList: [] });
}
```

### Inside component

```ts
const ticket = st.use.ticket();

<button onClick={() => st.do.openTicket(ticket.id, due)}>
  Open
</button>
```

### setter examples

```ts
st.do.setTicketModal(null);
st.set({ ticketModal: null });
```

### user.store.ts

```ts
import type { RootStore } from "../st";

async applyUserProfile() {
  const { self } = (this as unknown as RootStore).get();
  await (this as unknown as RootStore).refreshJwt();
  this.set({ self });
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

