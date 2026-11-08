---
description: Guards and authorization on signals and srvkit: slice guard maps, endpoint guards, the acting user.
paths:
  - "apps/**/*.signal.ts"
  - "libs/**/*.signal.ts"
  - "apps/**/srvkit/**"
  - "libs/**/srvkit/**"
---

<!-- akan:generated -->

# Authorization

- **Every `slice()` takes an explicit `{ guards: {…} }` second argument, and `root:` is always `Admin`.**
  `guards: { cru: false }` (or per verb) takes a generated verb off HTTP; `mcp: { cru: false }` only keeps it off the
  agent shelf.
- **Every custom `mutation` / `query` / `message` names its own `guards: [...]`** — the slice map reaches only
  generated endpoints, and a `pubsub` / `message` without its own declares none. `Public` belongs on a slice `get:`;
  on a mutation only for an act that must work signed out (sign-up/in, token refresh, an OAuth route), which also
  declares a `rateLimit`. A guardless endpoint answers every call with 403 and stops the boot outside local
  operation; MCP also refuses a mutation guarded only by `Public`.
- Guards serve HTTP and websocket alike: read `context.get<T>("account")`, never `getHttpContext()` /
  `getWebSocketContext()`; keep them side-effect free and re-runnable. The acting user comes from `.with(Self)` /
  `.with(CurrentUserId)` / `.with(Me)` (never a client-supplied id) and the caller's address from `.with(Ip)`.
- Keep `static name = "User";` on guard classes — `fetch` serializes it and the API explorer filters on it. It looks
  dead, so comment it.
- **Every guard declares `static scope: GuardScope`, no default**: `"account"` reads only the caller (MCP listings
  evaluate it to hide entries), `"resource"` needs the call's arguments and fails closed without them. `SignedIn` /
  `Admin` / roles are `"account"`, every `Can<Verb><Model>` is `"resource"`; `Person` adds `static agents = false`.
- `Can<Verb><Model>` guards in `srvkit/guards.ts` fail closed and ship with the model's library (`transportRule`).
  Services re-check ownership behind a guard — two independent gates.

- **Every endpoint and named slice names its guards** (`no-unguarded-endpoint`, a warning) — a `query` / `mutation` /
  `pubsub` / `message`, a named slice's `init()`, or a `slice()` map without `root` that names none (or `guards: []`)
  refuses every caller, and outside local operation the server does not boot. Write `guards: [Public]` when
  anonymous access is the intent.

- **A `slice()` takes its guard map as a second argument**, `slice(srv.task, { guards: { root: Admin, get: SignedIn,
  cru: SignedIn } }, (init) => ({...}))`. An `endpoint()` takes no guard argument at all —
  `endpoint(srv.task, ({ mutation }) => ({...}))` — so **every custom `mutation` / `query` / `message` names its own
  `guards: [...]` array**: `mutation(cnst.Task, { guards: [SignedIn] })`. `Public` always allows; other guards
  implement the `Guard` interface in `srvkit/` (server-only).
- **Read the caller inside a guard** with `context.get<T>("account")`, which works on HTTP and websocket calls
  alike — never branch on `getHttpContext()` / `getWebSocketContext()`. Every guard class also declares
  `static scope: GuardScope`, `"account"` or `"resource"`, with no default.
- **Read the current user inside a custom endpoint** by injecting an `InternalArg` with `.with(...)`:
  `mutation(cnst.Task, { guards: [SignedIn] }).with(CurrentUserId).exec(async function (currentUserId) { ... })`.
- **Auto-generated CRUD and `serve()` service methods / lifecycle hooks do not receive session context.** If an
  operation needs the acting user, expose a custom endpoint that takes it via `.with(CurrentUserId)` — never trust a
  client-supplied user id.
