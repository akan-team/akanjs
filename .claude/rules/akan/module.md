---
description: Domain modules under lib/: what each module file owns, and the modeling gotchas.
paths:
  - "apps/**/lib/**"
  - "libs/**/lib/**"
---

<!-- akan:generated -->

# Domain Modules

A business concept is one `lib/` folder holding its logic files
(`<model>.constant|dictionary|document|service|signal|store.ts`) and components
(`<Model>.Template|Unit|View|Zone|Util.tsx`). `constant`, `dictionary` and
`signal` are shared contracts with no platform-specific dependency; persistence and queries live in `document`,
orchestration in `service`, client state in `store`; `Template` is forms, `Unit` list/card items, `View` details,
`Zone` page sections, `Util` domain UI helpers.

- **`<model>.constant.ts`** — `enumOf("camelName", [...] as const)` classes, then
  `XInput → XObject → LightX → X → XInsight`, one blank line apart, `XInsight` even when empty. **Display and
  predicate logic goes on `LightX`** (`isNew()`, `canWrite(user?)`), which server and client both hold, never a util
  module — the most commonly missed rule. Collection helpers are `static` on `X`; a non-obvious field gets a short
  trailing comment. `Date` fields are prototype accessors that a spread drops — copy with `new cnst.X().set(user)`
  (`fieldRule`).
- **`<model>.document.ts`** — `XFilter extends from(...)` → `X extends by(...)` → `XModel extends into(...)`,
  `sort: {}` always present. Chain methods validate → mutate → `return this`, never `save()` (the caller saves, so
  `org.removeUser(id).removeInvite(id).save()` composes), with a one-line transition comment above each. Atomic
  counters live on the Model class with the updater callback, returning `!!modifiedCount`; indexes and derived
  totals go in `static override _onSchema`. **Removal is soft** and reads see live rows unless
  `{ withRemoved: true }`; the one hard delete is `purge<Filter>` / `purgeMany`, for data past retention.
  `updateById` / `removeById` fire no hooks — a cascading or `_postRemove` model removes through
  `remove<Model>(id)`, and `pickAndWrite` writes through the save hooks (`queryRule`).
- **`<model>.service.ts`** — a few lines: load → chain → `return await ….save()` (keep the `return await`). Side
  effects go in `override async _preUpdate` / `_postCreate`; fire-and-forget is `void`-ed. Load every referenced
  document, then save, then notify; writes that must land together go in `this.transaction(async () => …)` and
  their notification in `this.afterCommit(…)` (`queryRule`); a list of new rows is one `create<Model>Many(rows)`. Return `null` / `false` for not allowed or not found;
  the signal decides whether that is an error.
- **`<model>.signal.ts`** — `XInternal` → `XSlice` → `XEndpoint`, all three even when empty; `exec` is a one-liner
  calling the service.
- **`<model>.store.ts`** — custom actions only for a toast, an optimistic update, or a multi-field write:
  `await fetch.X` → `this.setX(...)` → toast, or mutate the client model, `void fetch.*`, then commit.
  `this.pick(...)` when the value must exist, `this.get()` when it may not, `this.set({...})` to write; lists through
  the collection API (`xList.set(x).save()`), not spread. **Another store is reached through `this`**:
  `import type { RootStore } from "../st"` (type-only — `st.ts` imports every store), then
  `(this as unknown as RootStore).logout()` or `.set({ … })` / `.get()`; every store is mixed into one root at
  runtime, so the cast only names what `this` already is.
- **`<model>.dictionary.ts`** — empty stages still written:
  `.of() → .model() → .insight() → .query() → .sort() → .enum() → .slice() → .endpoint() → .error() → .translate()`;
  every `.arg()` named, framework `skip` / `limit` / `sort` included; `modelDictionary` / `scalarDictionary` /
  `serviceDictionary` by module kind.
- **`<module>.abstract.md`** — a title, one sentence naming what the module owns, a `## Rules` list of two to five
  invariants the code cannot show, an optional workflow chain (`draft -> signed -> active`). Never restate fields or
  types; update it when an invariant or workflow changes.

- **`{name}`, never `{{name}}`** (`no-double-brace-placeholder`), in a dictionary `.error()` / `.translate()` entry —
  only single braces interpolate.
- **Never return a value from a store action** (`no-return-in-store-action`) — actions dispatch through `st.do.*` as
  `void`; write state with `this.set({ ... })`. A bare `return;`, a nested callback's `return`, a getter, and a `static`
  helper are fine.
- **Never redeclare a generated CRUD endpoint name** in `*.signal.ts` (`no-redeclare-predefined-endpoint`).
- **Never ask a list for more than 500 rows** (`no-oversized-list-limit`) — the server serves at most 500 per
  request and drops the rest without an error, so `fetch.xListInY(0, 10000)` silently stops at row 500. Page with
  skip/limit or `st.do.loadMoreOf<X>()` while `hasMoreOf<X>`, or compute the figure in an insight or an endpoint.

## Modeling And Query Gotchas

- **Slices return a query, not a list.** A slice `exec` must return `this.<model>Service.query<Filter>(...)`, never
  a `list<Filter>(...)` / `listBy...(...)` array. Returning an array type-checks but fails at runtime with
  `Unknown document field path: 0`. (See Recipe 3.)
- **Custom endpoint names must not collide with generated CRUD.** `create/update/remove/view/edit/merge<Model>`
  already exist wherever the slice mounts the verb. A collision builds green and the server refuses to boot
  (`[DI:fetch]`) — pick a distinct verb.
- **Numbers are `Int` or `Float`, never `Number`.** `field(Number)` / `.body("x", Number)` fail to typecheck.
- **Array fields use `field([T])`** — `tags: field([String])`, `images: field([File])`.
- **Reading a secret field needs an explicit select, and the two call sites spell it differently.**
  `field(...).secret()` values are stripped from query results by default. The model facade takes the projection
  **bare** — `this.userModel.pickById(id, { passwordHash: true })`, likewise `pickOne` / `find` / `findOne` /
  `findById`. A generated filter accessor takes it **inside the option object** —
  `this.userModel.findByAccountId(accountId, statuses, { select: { passwordHash: true } })`. Handing `{ select: … }`
  to the facade projects a field named `select`, which no model has, and throws `Unknown document field path`.
- **`cascade` names a direction, and the wrong one is a data loss** — `removeRef` on the relation the owner holds,
  `removeWith` on the child's reference to its owner. A query-level removal fires no hooks and therefore no cascade.
- **`q.search()` is a filter node, not a slice requirement.** `bySearch: filter().arg("text", String).query((text,
  q) => q.search(text, { prefix: true }))` generates `listBySearch` / `countBySearch` / `queryBySearch` /
  `insightBySearch` for free. Only add a search *slice* when the model's data is safe to enumerate.

## Akan Module Abstracts

- Before changing a domain, service, or scalar module, read its `*.abstract.md` file first.
- Update the abstract when business invariants, workflows, or public behavior change.
- Do not update the abstract for formatting-only, import-only, or style-only changes.
- Service modules live in `lib/_<service>`, but their abstract file is `<service>.abstract.md`.
- Keep an abstract short — the invariants the code cannot show, and nothing it already states. `akan quality scan` warns past 300 lines.
