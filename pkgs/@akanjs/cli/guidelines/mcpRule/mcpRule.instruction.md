# Akan MCP Exposure Guideline

## Purpose
Use this when writing a `*.signal.ts`, configuring `option.setMcp(...)`, or debugging a tool an agent cannot see.
The always-loaded convention set carries the short version; this is the full contract.

## Exposure Rule

Every signal is served to AI agents as an MCP server on `POST /mcp`. **`/mcp` is mounted by default and exposure
follows an endpoint's guards — there is no per-endpoint opt-in, and nothing to write in a signal file.** An endpoint
that declares a real guard is published; one that declares none is refused, and so is a mutation whose only guard is
`Public`. `AKAN_MCP=false` takes the whole surface off. The reasoning is that the guards are already the
authorization decision and `filterForAccount` re-reads them per caller on every listing, so a second per-endpoint
switch says nothing the guards do not — while guaranteeing that every endpoint added later is invisible to agents
until somebody remembers it.

## Configuration
Settings live in the app's `lib/option.ts` — `option.setMcp({ … })`, taking `enabled`, `readOnly`, `path`,
`version`, `instructions`, `allowedOrigins`, `pageSize`, `language`, `legacyTextBlock`, and `auth`. **Not `main.ts`**: the gateway
there only spawns children, and `option.ts` is the app-authored file `server.ts` already hands to the process that
mounts `/mcp`. Every lib's option is read in mount order with the app's last, so an app tightens what a library
declared without restating it. Each field also has an env spelling (`AKAN_MCP`, `AKAN_MCP_READONLY`,
`AKAN_MCP_PATH`, `AKAN_MCP_VERSION`, `AKAN_MCP_INSTRUCTIONS`, `AKAN_MCP_ALLOWED_ORIGINS`, `AKAN_MCP_PAGE_SIZE`,
`AKAN_MCP_LANGUAGE`, `AKAN_MCP_LEGACY_TEXT`, `AKAN_MCP_AUTH_SERVERS`, `AKAN_MCP_SCOPES`, `AKAN_MCP_RESOURCE`) for a
deployment that configures what the source does not, which the option overrides.
The two booleans answer to `AKAN_PUBLIC_MCP` / `AKAN_PUBLIC_MCP_READONLY` too, the same pairing `AKAN_OPENAPI`
has, and a value written in code wins over the env of the same name — an explicit `undefined` is not a value.
`AKAN_MCP_PATH` is normalized to a leading `/`, because the route key and the OAuth metadata path are both built by
concatenation.

## Declaring Endpoints
```typescript
// apps/<app>/lib/option.ts
export const option = new AkanOption<ModulesOptions>().setMcp({
  instructions: "Domain tools for this app. Start from taskInTodo.",
  language: "en",
});
```

```typescript
// <model>.signal.ts — every one of these is an MCP tool or prompt, with no `mcp:` option anywhere
export class TaskSlice extends slice(
  srv.task,
  { guards: { root: Admin, get: SignedIn, cru: SignedIn } },
  (init) => ({
    // its own guards: the map above reaches base CRUD and the root slice, never a named slice — so a named slice
    // that names none is refused rather than published, which is the one shape to watch for.
    inTodo: init({ guards: [SignedIn] }).exec(function () {
      return this.taskService.queryByStatuses(["todo"]);
    }),
  }),
) {}

export class TaskEndpoint extends endpoint(srv.task, ({ mutation, prompt }) => ({
  startTask: mutation(cnst.Task, { guards: [SignedIn] })
    .param("taskId", ID)
    .exec(async function (taskId) {
      return await this.taskService.startTask(taskId);
    }),
  reviewTask: prompt({ guards: [SignedIn] })
    .param("taskId", ID)
    .exec(async function (taskId) {
      const task = await this.taskService.getTask(taskId);
      return [Msg.user(`Review this task and suggest next steps.`), Msg.resource(`akan://task/${taskId}`, task)];
    }),
})) {}
```

## Refusals And Wire Behaviour
- **The refusals are fail-closed**: **an endpoint that declares no `guards` at all** (nobody decided who may reach
  it), **a mutation with no real `guards`** (`[Public]` is having none, spelled out — it answers true
  unconditionally), `pubsub` and `message` (their internal args read a socket an MCP request does not have), an
  `Any` or `Upload` return, a file upload, and **an argument typed `Any` that must be filled**.
  A `prompt` refuses two more, because its `arguments` is one string per name with no schema beside it: a **list
  argument**, which could never carry a second value, and **any `Any` argument** — a tool leaves that out of its
  schema, and a prompt has no schema to leave it out of.
- **Every refusal is named in the boot log**: one `warn` per endpoint plus a `MCP catalogue: tools=… prompts=…`
  count. Read that line first when a tool you expected is missing — and it is the *only* place the answer exists,
  because there is no absent opt-in to notice. The API explorer badges the same rule per endpoint (`MCP` /
  `MCP refused`), from the same shared implementation the catalogue runs.
- **An `Any` argument is left out of the published schema** rather than described as `{}` — it tells a model
  nothing — and a value sent for one is refused by name, so the endpoint reads it as omitted. That is what happens
  to the root list's raw `query` descriptor: read as sent, it would be an arbitrary filter over every model you
  publish. Declare a named filter slice when an agent should narrow a list.
- **A nullable model return publishes no `outputSchema`**, and its empty answer ships as the text `null` with no
  `structuredContent`. That field is an object by definition, so `null` cannot ride in it any more than an array
  can — a list is wrapped as `{ items: … }` for the same reason — and a declared schema obliges every result to
  match it, so a client SDK throws on the first call that finds nothing. A nullable *list* keeps its schema, and a
  scalar return has no structured half at all: it ships as the value itself, not as JSON.
- **An `outputSchema` names no `hidden`, `secret`, or `visual` field.** Every response has the first two stripped,
  so publishing them promises a property no answer can carry — and on a model like `user` the names are the leak.
  Your *input* schema keeps all three: they are legal to send, and the same model describes a request body.
- **A `field.visual` is stripped from every MCP result.** It is the marker for a field the page renders and no
  question is answered from — a blur placeholder, a rendered HTML body — and it is cost rather than secrecy, so
  nothing is refused over one. The strip happens in the MCP dispatcher rather than in `resolveReturn`, which every
  ordinary HTTP response also passes through: the whole point is that a browser still receives it. That is also why
  the readable schema drops it — a non-optional visual field would otherwise be listed `required` and a validating
  client would refuse a result that correctly omits it.
- **A structured result ships twice by default**, once as `structuredContent` and once as the same JSON in the text
  block, which is what the spec asks of a server for clients predating the structured field. It is also a flat
  doubling of what every model-returning tool costs a model. `option.setMcp({ legacyTextBlock: false })` — or
  `AKAN_MCP_LEGACY_TEXT=false` — leaves a one-line pointer in the text block instead, for a deployment whose
  clients read the structured half. A scalar return is unaffected: it has no structured half to point at, so it
  ships as the value itself either way.
- A refused endpoint answers the *same* "unknown tool" as one that does not exist. Never make that
  message more helpful — the difference is what enumerates your private surface. A guard's refusal is generalized
  the same way: the caller reads `You are not permitted to perform this action.`, never `Access denied by guard:
  Admin`, which names your authorization structure to the one caller barred from it. A domain `Err` resolves
  through the dictionary first and keeps its own words.
- The `readOnly` / `destructive` / `idempotent` hints a client renders are derived from the endpoint type and key
  and are not configurable. Clients are told to distrust hints; they are never a gate.
- **`AKAN_MCP_READONLY=true` is the read-only-deployment valve, not the exposure switch.** It drops every mutation
  whatever it declared, and reports each one in the boot log like any other refusal.
- OAuth resource metadata is published at `/.well-known/oauth-protected-resource` (and at that path plus the mount
  path, the spelling most clients try first). `AKAN_MCP_AUTH_SERVERS`, `AKAN_MCP_SCOPES`, and `AKAN_MCP_RESOURCE`
  configure it; `insufficient_scope` is enforced only once `AKAN_MCP_SCOPES` is set. A token carrying no `aud` at
  all is refused once `AKAN_MCP_AUTH_SERVERS` names an issuer — that issuer mints tokens for its other resources
  too — and accepted while none is named, because a first-party Akan token is bound by app and environment.
- **The boot log names every published entry with no dictionary `.desc()`.** An agent picks a tool by its
  description, so a missing one is a broken tool. What the framework generates has no text of its own and borrows
  the model's: the generated list reads the `.of()` label, and the base CRUD tools append the model's `.desc()` to
  their generated `Get X`. Write that model `.desc()` — it is the only text those entries can carry. There is no
  `akan quality scan` rule for this any more: a source scanner found the exposure only as an `mcp:` literal, and
  with exposure derived from the guards the resolved catalogue is the only place that can answer.
- A browser-hosted client needs `allowedOrigins` **and** the CORS answer the server sends back for those origins.
  Every other MCP client sends no `Origin` at all, and the one that does is matched against the forwarded host so
  a proxy does not turn each call into a 403 — which is only as trustworthy as an edge that *overwrites* that
  header. `AKAN_MCP_RESOURCE` pins the resource identifier where you cannot guarantee it.
- **A `resources/read` uri that does not decode** — a stray `%` — is `Unknown resource`, not a server failure.
- **A caller's own mistake is reported as one** and never as a server failure: an argument that is missing,
  unparseable or **undeclared** comes back as `isError` naming it — `additionalProperties: false` travels in the
  published schema and nothing on the wire enforces it — and so does a document that is not there, as
  `No <model> found for the arguments given.` A `prompt`, having no `isError` to carry a refusal, answers `-32602`.
  Only a real failure logs a stack; an agent can drive the rest at will.
- **Three revisions are spoken**: the modern `2026-07-28` and the legacy `2025-11-25` / `2025-06-18`, which are
  wire-identical over the POST-only surface this implements — a client whose proposal is not listed is told to
  disconnect. An unknown proposal is answered at whichever end of that list it is closer to, and an unimplemented
  method answers `404` to a modern client but `200` to a legacy one, whose era spends `404` on "your session is
  gone".
- **A modern-era request mirrors `MCP-Protocol-Version` and `Mcp-Method` into headers** (plus `Mcp-Name` when the
  body names one), and one that leaves a mirror out is refused just like one that contradicts the body: a gateway
  rule keyed on a header never fires for the request that omitted it. Legacy requests are not checked. Capabilities
  are derived from the catalogue, so a server with no prompts does not advertise `prompts`.
- **An expired or wrongly-audienced bearer token is refused up front**, so an agent is told to authenticate rather
  than that the tool does not exist. Its **signature is not checked** — that needs your app's own secret — so a
  token signed wrong, like an opaque one, still degrades to an anonymous caller.
- **Resource URIs**: `akan://<model>/{id}`, `akan://<model>/light/{id}`, `akan://<model>/list` for the model's own
  list, and `akan://<model>/list/<sliceKey>` for a slice's. The root list takes no third segment on purpose — any
  token there is one a slice could also be named. **Those four are the whole set**, so only the generated reads are
  addressable: a custom endpoint keeps its tool and gets no resource template.
- **The catalogue is one language**, `en` unless `language` says otherwise: it is built once at boot and cached by
  clients, so there is no `Accept-Language` negotiation.

## `prompt()`
**`prompt()`** is invoked by the *user* — a client renders it as a slash command — not chosen by the model. `exec`
returns `PromptMessage[]`, or a bare string that is wrapped into one user message; build them with `Msg.user` /
`Msg.assistant` / `Msg.link` / `Msg.resource` / `Msg.image` / `Msg.imageOf`. It takes `.param()` and `.search()`
only, because `prompts/get` sends a flat string map. **An embedded payload is masked by the model you name** —
`Msg.resource(uri, task, { model: cnst.LightTask })`, or `Msg.mask(cnst.LightTask, task)` for one piece of an
assembly. Taking the model as an argument is what makes a `{ ...doc }` spread maskable, since that and `toJSON()`
arrive with the class already gone; a value with no model named whose `hidden`/`secret` fields are populated is
**refused**, one level into a plain object too. **A `prompt` is also mounted as a
plain HTTP `GET` whether or not you enabled MCP**, because that route is what lets a web UI preview one — and it
is in your OpenAPI document like any other `GET`, answering the one fixed `PromptMessage[]` shape. MCP exposure
gates the catalogue, not the surface, so guard it
like any other read — and a prompt declaring no
`guards` at all is named in the boot log, while an explicit `[Public]` is a decision and stays quiet. Every `Msg` builder takes
optional `annotations` last (`audience`, `priority` 0..1, `lastModified`) — give the instruction a high `priority`
and its attachments a low one, or a client with a full window drops blocks by position and keeps the attachment
over the ask.

## Progress Reporting
**`McpProgress.report(n, { total, message })`** reports progress from anywhere inside a call, a service or adapter
frames down included, and is a no-op when nobody is streaming — so the same code runs unchanged over HTTP, a
websocket, and in tests. `McpProgress.streaming` says whether anyone is reading, for a report whose message
costs something to assemble.
