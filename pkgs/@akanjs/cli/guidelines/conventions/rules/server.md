---
description: Services, signals, documents and srvkit adapters: calls, queries, injection and where errors are thrown.
paths:
  - "{apps,libs}/**/*.{service,signal,document}.ts"
  - "{apps,libs}/**/srvkit/**"
---

# Services And Signals

- `serve(...)` services hold business operations. Signals hold contracts: `internal(...)` for init, interval, cron
  and queue jobs (retries, dead letter: `workspaceRecipes` Recipe 5), `slice(...)` for focused data views feeding
  stores and zones, `endpoint(...)` for queries and mutations. External APIs and infrastructure go through
  `srvkit/` adapters injected into services, never vendor clients in domain logic.

## Calls, Queries, Agents

- **Guards (`transportRule`)**: an endpoint, a named slice's `init()` or a root slice that declares no guards is
  refused with 403 on every transport, and outside local operation the server does not boot with one. Name its
  guards, or `[Public]` to open it on purpose; `AKAN_UNGUARDED_ENDPOINTS=open` is a deployment's stopgap, never the
  fix.
- **Wire (`transportRule`)**: a deadline is the endpoint's `{ timeout: <ms> }` (undeclared, the client quits at
  30 s; the handler is not cancelled); `{ cache }` only on a `query` with no internal argument, capped at one day,
  dropped early by `invalidate(endpoint, args?)` on a plugged `EndpointCacheControl`; `{ rateLimit }` per endpoint,
  `option.setRateLimit` per app, `plug(RateLimit)` for a business key. `socketId` names a connection, not a caller. A
  device proves itself with a `MachineToken`. Server to server, `fetch.clone({ origin })` opens no socket
  without `connect: true`, retries through `retry`, and rethrows a remote `Err` as is — never wrapped or re-keyed.
- **Body types**: `.body()` / `.param()` take scalars, model refs, or `enumOf(...)`; `Int` / `Float`, never
  `Number` (`pkgs/akanjs/signal/endpointInfo.ts`); `Upload` only in a `fileUpload: true` mutation; bytes are
  `Binary`, never `Any`. A model or scalar argument is checked against the request schema on every transport: a
  wrong JSON type, a value outside its enum or a missing required field answers 400 with `data.name` naming the
  path (`data.items.2.price`); a defaulted field may be left out, an undeclared key is dropped, and a stored model's
  input keeps an absent field absent.
- **Reserved names**: generated CRUD (`create<Model>`, `update<Model>`, `remove<Model>`, …) exists for every model
  whose slice mounts the verb. `fetch.*` is one namespace across modules and a pubsub or message is routed by its bare
  name, so the server refuses to boot on two claims of one name (`[DI:fetch]`, `[DI:socket]`), naming both.
- **Queries (`queryRule`)**: the root slice takes `queryKey` + `args`, never a raw query. A slice `exec` returns a
  `query<Filter>(…)` descriptor (never a `list<Filter>` array) and is paged through `initX(…, { sort, page, limit })`.
  A projection is bare on the facade (`pickById(id, { secret: true })`), under `select` on a filter accessor — the
  only way to read a `field.secret`. More rows: `loadMoreOf<Model>()` / `hasMoreOf<Model>`, never
  `count > page * limit`. A filter's `remove*` / `update*` are hookless (no cascade). No value is `q.empty`, never
  `q.missing`.
- **Search**: `q.search(text, { prefix: true })` in a filter, at an AND position, over `text`-role fields; a search
  *slice* only on data safe to enumerate; blank input matches nothing — never a passthrough.
- **`cascade` names a direction; the wrong one loses data**: `removeRef` on the owner's relation, `removeWith` on
  the child's reference to its owner. A query-level removal runs no cascade.
- **MCP (`mcpRule`)**: `/mcp` publishes every guarded endpoint by default; `mcp: false` (or a `slice()` `mcp` map
  mirroring `guards`) is curation, not authorization. `guards: [Every, Person]` reserves an act for a person;
  `.with(AgentCall)` narrows an agent's call. Settings are `option.setMcp` in `lib/option.ts`; `JWT_SECRET` is
  required outside `local`. Never make a refusal message more helpful. Every entry needs a `.desc()`; brief a
  screen with `page().prompt(name, description)`, and publish one component a host draws with
  `page().app(name, description, load)` — a read-only tool whose `load` may only query.
- **In-page agent (`agentRule`)**: mount `<Agent.Chat />` once in a layout; it never executes tools and refuses
  every call until `option.setAgentAccess(<guard>)`, which decides who — what a turn may ask is
  `option.setAgentRequestPolicy`, size-capped until one is set; the LLM is `option.setLlm({ apiKey, model, host })`, never env.
  The surface is what components declare — `st.tool(…).exec(fn)` beside its control, `st.use` / `st.sel` /
  `st.ref` keys — never a store class. `st.use.x({ agent: false })` hides a key; its model's `hidden` / `secret` /
  `visual` fields are stripped at read. A tool value is capped at 20,000 characters. Route guidance is
  `<Agent.Guide instructions="…" />`; model-facing text is English.

## Injection And Adapters

- A field named `<refName>Service` / `<refName>Signal` resolves to that registration — the suffix is required
  (`pkgs/akanjs/service/injectInfo.ts`). In a service: `service<srv.XService>()` · `plug(AdapterClass)` /
  `plug(StorageAdaptorRole)` · `use<T>()` only for a legacy `option.ts` singleton · `env(...)` for config.
- `memory(...)` takes a scalar or model class (`memory(Map, { of: CallStateInput })`); never hand-encode JSON into a
  `String` memory.
- A file your own code stored through `plug(StorageAdaptorRole)` has its disk path at
  `storage.resolveLocalPath?.(path, access)` (`fieldRule`): `null` means refused (answer 404, never fall back to
  `readData()`), `undefined` means the adaptor keeps no local files, and a key that comes from a request passes
  `access: "public"`. A `File` field is not one: `libs/shared` stores it through its own `StorageApi`.
- **A new adapter is an `adapt()` singleton in `srvkit/`**, injected with `plug(TheClass)`, key `as const`. Never
  register it in `lib/option.ts` (it self-registers); never construct a `Logger` in it (`this.logger` exists);
  lifecycle work in `override async onInit()`. A per-use value object is a plain class. Legacy
  `constructor(options)` adapters migrate only when already being changed. Example and adapter conventions (one
  `#api<T>` with a timeout, pagination, secrets, parameter shapes): `workspaceRecipes` Recipe 2.

## Error Placement

- State-machine preconditions throw in `document.ts`, cross-document rules in `service.ts`, request policy in
  `signal.ts` guards. Best-effort code returns a sentinel (`null`, `undefined`, `[0, 0]`, `{}`) — no Result types.
- A `pick` or generated `get<Model>` that finds no live row answers 404 `base.error.documentNotFound` by itself
  (`NoDocumentError`); load with a nullable `load<Model>` and throw `Err.NotFound` only to say more than that.
- An endpoint names the errors it throws on purpose — `errors: { 409: ["ticket.error.locked"] }` in its signal
  option, with keys its dictionary defines and never `base.error.*`. That is the status's OpenAPI response and a line
  of the MCP tool's description; outside production a thrown key it leaves out warns once. A caller narrows with
  `Err.is(error, "ticket.error.locked")`.
- `try/catch` turns an exception into a decision: guards → `logger.warn` → `false`; adapters → `logger.error` →
  `null`; UI `try/finally` resets a spinner. A bodyless `catch {}` needs a one-line reason.
- Store actions do not `try/catch` (the framework toasts the `Err`); client validation is `msg.error("<key>")` plus
  an early return, never a throw.
