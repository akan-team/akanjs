---
"akanjs": minor
---

feat(signal): serve any app's signals to agents as an MCP server on `POST /mcp`

An endpoint already declares everything an agent tool needs — a name, typed arguments, a return model, guards, and
a dictionary entry saying what it is for in two languages. What was missing was the wire. Every `*.signal.ts` can
now be published as Model Context Protocol tools, resources, and prompts, with no per-endpoint adapter code.

Turn it on in an app's `main.ts` — `new AkanApp("./server", { mcp: { enabled: true } })`. Every field also has an
env spelling (`AKAN_MCP`, `AKAN_MCP_READONLY`, `AKAN_MCP_PATH`, `AKAN_MCP_INSTRUCTIONS`, `AKAN_MCP_ALLOWED_ORIGINS`,
`AKAN_MCP_LANGUAGE`, `AKAN_MCP_AUTH_SERVERS`, `AKAN_MCP_SCOPES`, `AKAN_MCP_RESOURCE`, …) because the gateway reaches
a child process through its environment; a value written in code wins over the env of the same name.

**Nothing is exposed until it says so, slices included.** A guard stops a call, but the *name and argument schema*
of something like `getAccessTokenByAdmin` are themselves worth hiding, and `tools/list` publishes both. Opt in per
endpoint with `query(cnst.X, { guards: [...], mcp: { expose: true } })`, per slice with `init({ guards: [...],
mcp: { expose: true } })`, and per generated CRUD verb with `slice(srv.x, { guards: {…}, mcp: { get: true } }, …)`
— one flag per verb, never a blanket `true`.

**A tool runs the endpoint's own pipeline, not the service behind it.** `McpExecutionContext` extends the HTTP
one, so guards, middleware, internal args, `hidden`/`secret` masking, and serialization all still run: an agent
tool is exactly as safe as the endpoint it mirrors, and cannot be more permissive by construction.

**Refusals are fail-closed and survive opting in** — `pubsub` and `message` (their internal args read a socket an
MCP request does not have), an `Any` or `Upload` return, a file upload, a mutation with no real guards, and a
required `Any` argument. Each is named in the boot log beside `MCP catalogue: tools=… prompts=…`, along with every
entry published with no description and every one published with no guards at all. `akan quality scan` covers the
two shapes a source scanner can see, `akan.mcp.missing-description` and `akan.mcp.unguarded-exposure`, and the API
explorer badges each endpoint `MCP` / `MCP refused` from the same shared predicate.

**Three protocol revisions from one stateless handler**: the modern `2026-07-28` and the legacy `2025-11-25` /
`2025-06-18`. Supporting the legacy pair turned out to cost almost nothing once it was clear no session store was
needed, and dropping it would have disconnected every client shipping today.

Other pieces:

- **Resources.** Generated reads publish `akan://<model>/{id}`, `akan://<model>/light/{id}`, `akan://<model>/list`,
  and `akan://<model>/list/<sliceKey>` alongside their tool. Those four shapes are the whole set — a custom
  endpoint keeps its tool and is named in the boot log rather than given a template that would resolve to someone
  else's endpoint.
- **`prompt()`**, a fifth endpoint kind: the one a *user* invokes by name, which a client renders as a slash
  command. Takes `.param()` and `.search()` only, returns `PromptMessage[]` built with `Msg.user` / `Msg.link` /
  `Msg.resource` / `Msg.image` and friends. Also mounted as a plain HTTP `GET` whether or not MCP is enabled, so a
  web UI can preview one — which is why it is in the OpenAPI document and why it must be guarded like any read.
  An embedded payload is masked by the model you name (`{ model: cnst.LightTask }`), taking the model as an
  argument so a `{ ...doc }` spread masks as correctly as a hydrated document.
- **`McpProgress.report(n, { total, message })`** streams progress from anywhere inside a call — a service, an
  adapter, a loop several frames down — and is a no-op when nobody is reading, so the same code runs unchanged
  over HTTP, over a websocket, and in tests.
- **Auth** is OAuth 2.0 protected-resource metadata plus a bearer check. A provably unusable token — expired, or
  audienced elsewhere — is refused up front rather than degraded to anonymous, because an anonymous caller is told
  a tool does not exist instead of being told to authenticate. A token carrying no `aud` is refused once
  `AKAN_MCP_AUTH_SERVERS` names an issuer and accepted while none is: that is the confused-deputy case RFC 8707 is
  a MUST for, whereas a first-party Akan token is already bound by app and environment.
- **Descriptions come from the dictionary you already wrote.** The words an agent reads to pick a tool are the
  same `[en, ko]` pair the UI renders as a label, so an app that localizes well documents itself to agents for
  free. Generated entries borrow the model's `.of()` and `.desc()`, since none of them has text of its own.
- `JsonSchemaBuilder` is now shared with the OpenAPI document via a `refPrefix` option rather than forked, and the
  exposure predicate lives in `akanjs/common` so the server catalogue and the browser API explorer cannot disagree.
- `AgentCatalogue` (`akanjs/signal`) holds the audience-independent half — enumerating a signal registry, holding
  one name per entry, and resolving dictionary text — so a second agent transport reuses it rather than forking
  `McpDocument`.

Errors are reported as the caller's own where they are: a missing, unparseable, or undeclared argument and a
document that is not there come back as `isError` naming it, and only a real failure logs a stack. An endpoint
that did not opt in answers the same "unknown tool" as one that does not exist, and a guard's refusal never names
the guard — the difference between those answers is what would enumerate the private surface.
