---
description: Guards and authorization on signals and srvkit: slice guard maps, endpoint guards, the acting user.
paths:
  - "{apps,libs}/**/*.signal.ts"
  - "{apps,libs}/**/srvkit/**"
---

# Authorization

- **Every endpoint and named slice names its guards** (`no-unguarded-endpoint`, a warning) — a `query` / `mutation` /
  `pubsub` / `message`, a named slice's `init()`, or a `slice()` map without `root` that names none (or `guards: []`)
  answers every call with 403 on every transport, and outside local operation the server does not boot. Write
  `guards: [Public]` when anonymous access is the intent; `AKAN_UNGUARDED_ENDPOINTS=open` is a deployment's stopgap,
  never the fix.
- **A `slice()` takes its guard map as a second argument**, and `root:` is always `Admin`:
  `slice(srv.task, { guards: { root: Admin, get: SignedIn, cru: SignedIn } }, (init) => ({...}))`. `Admin` is
  `libs/shared`'s; an app without that lib is scaffolded with `root: None, cru: None`, shut until it names a guard
  of its own.
  `guards: { cru: false }` (or per verb) takes a generated verb off HTTP; `mcp: { cru: false }` only keeps it off the
  agent shelf.
- **An `endpoint()` takes no guard argument** — `endpoint(srv.task, ({ mutation }) => ({...}))` — and the slice map
  reaches only generated endpoints, so every custom `mutation` / `query` / `message` names its own array:
  `mutation(cnst.Task, { guards: [SignedIn] })`. A `pubsub` / `message` without its own declares none.
- `Public` always allows. It belongs on a slice `get:`; on a mutation only for an act that must work signed out
  (sign-up/in, token refresh, an OAuth route), which also declares a `rateLimit`. MCP refuses a mutation guarded only
  by `Public`. Other guards implement the `Guard` interface in `srvkit/` (server-only).
- Guards serve HTTP and websocket alike: read `context.get<T>("account")`, never `getHttpContext()` /
  `getWebSocketContext()`; keep them side-effect free and re-runnable.
- **The acting user comes from an `InternalArg`**, never a client-supplied id:
  `mutation(cnst.Task, { guards: [SignedIn] }).with(CurrentUserId).exec(async function (currentUserId) { ... })`, or
  `.with(Self)` / `.with(Me)`; the caller's address from `.with(Ip)`. Generated CRUD and `serve()` service methods /
  lifecycle hooks receive no session context, so an operation that needs the acting user is a custom endpoint.
- Keep `static name = "User";` on guard classes — `fetch` serializes it and the API explorer filters on it. It looks
  dead, so comment it.
- **Every guard declares `static scope: GuardScope`, no default**: `"account"` reads only the caller (MCP listings
  evaluate it to hide entries), `"resource"` needs the call's arguments and fails closed without them. `SignedIn` /
  `Admin` / roles are `"account"`, every `Can<Verb><Model>` is `"resource"`; `Person` adds `static agents = false`.
- `Can<Verb><Model>` guards in `srvkit/guards.ts` fail closed and ship with the model's library (`transportRule`).
  Services re-check ownership behind a guard — two independent gates.
