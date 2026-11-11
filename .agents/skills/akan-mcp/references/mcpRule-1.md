<!-- akan:generated -->

# Akan MCP Exposure Guideline

## Purpose
Use this when writing a `*.signal.ts`, configuring `option.setMcp(...)`, debugging a tool an agent cannot see, or
opening an app's service to agents end to end — the rollout checklist and the exposure design rules are at the end.
The always-loaded convention set carries the short version; this is the full contract.

## Exposure Rule

Every signal is served to AI agents as an MCP server on `POST /mcp`. **`/mcp` is mounted by default and exposure
follows an endpoint's guards — there is no per-endpoint opt-in, and nothing to write in a signal file.** An endpoint
that declares a real guard is published; one that declares none is refused, and so is a mutation whose only guard is
`Public`. `AKAN_MCP=false` takes the whole surface off, and an edge server (`AKAN_PUBLIC_OPERATION_MODE=edge`) starts
with it off — `AKAN_MCP=true` or `setMcp(true)` puts it back. The reasoning is that the guards are already the
authorization decision and `filterForAccount` re-reads them per caller on every listing, so a second per-endpoint
switch says nothing the guards do not — while guaranteeing that every endpoint added later is invisible to agents
until somebody remembers it.

## Keeping An Endpoint Off The Shelf — `mcp: false`

Guards answer "may an agent call this". They do not answer "does this belong on a shelf", and those are different
questions: a step of a UI-driven state machine (`requestPhoneCodeForSignin`, `setPasswordInPrepareUser`) is
perfectly guarded, perfectly callable, and a model would only ever call it by mistake. **`mcp: false` is that
second answer, and it is an opt-*out*: everything still publishes by default, so an endpoint added later is
visible without anyone remembering it.**

```ts
requestPhoneCodeForSignin: mutation(Boolean, { guards: [Every], mcp: false }),
inTodo: init({ guards: [SignedIn], mcp: false }),           // the slice's list and insight together
export class FileSlice extends slice(srv.file, {
  guards: { root: Admin, get: SignedIn, cru: SignedIn },
  mcp: { cru: false },                                       // reads yes, generated writes no
}) {}
```

- **It is curation, not authorization.** HTTP serves the endpoint exactly as before and the guards are still the
  only thing deciding who may call it. Never write `mcp: false` where you meant a guard. To take generated CRUD off
  HTTP too, write `guards: { cru: false }`.
- **The `mcp` map on `slice()` mirrors the `guards` map above it** — same keys (`root`, `get`, `cru`, `create`,
  `update`, `remove`), same fallbacks (`create`/`update`/`remove` inherit `cru`), and the same scope: it narrows
  the root slice and the generated CRUD, and never reaches a named slice or a custom endpoint. Those declare
  their own `mcp` beside their own `guards`. The bare `mcp: false` is every key at once, still within that scope.
- **An app's slice replaces a lib's whole**, on the server and in the client: its own `guards` (a `None` verb is
  denied everywhere) and its own `mcp` map, or, when it writes none, every verb the lib's slice took off stays off.
  To keep a mounted lib's tools off without its slice, use `setMcp({ excludeSignals, excludeEndpoints })` (below).
- **A view keeps reaching it.** To a host that renders MCP Apps views, an endpoint refused for `mcp: false` alone
  is published with `visibility: ["app"]`: an app's view may call it, the model is never shown it (below). Every
  other refusal still holds there.
- **`mcp: true` is the default and is a no-op**; write it only to say out loud that an entry is deliberately on
  the shelf. It does not override a shape refusal (an `Any` return stays refused) and it cannot publish something
  the guard rules keep out.
- **Reach for it by cost, not by taste.** Every entry inlines the schema of every model it mentions, so a plain
  21-field model with one named slice costs 12.6KB across its eight entries. `mcp: { cru: false }` on that model
  takes it to 4.7KB — the write entries carry both the input *and* the full model, and are 63% of it. Those figures
  are for `outputSchema: "full"`; the default names nested models instead of inlining them (below). Measured on a
  fully open 347-tool catalogue: 1194KB before, 532KB under the default, 194KB under `"none"`, and 1046KB even under
  `"full"` — the id and nullable savings apply in every mode — before any endpoint was curated.

## Configuration
Settings live in the app's `lib/option.ts` — `option.setMcp({ … })`, taking `enabled`, `readOnly`, `path`,
`version`, `instructions`, `allowedOrigins`, `pageSize`, `language`, `legacyTextBlock`, `outputSchema`, `rateLimit`,
`promptBudget`, `apps`, `modern`, `auth`, and `excludeSignals` / `excludeEndpoints` (curation like `mcp: false`,
added up across libs, an unmatched name warned at boot) — or `setMcp((env) => …)` for settings derived from the
server env.
**Not `main.ts`**: the gateway
there only spawns children, and `option.ts` is the app-authored file `server.ts` already hands to the process that
mounts `/mcp`. Every lib's option is read in mount order with the app's last, so an app tightens what a library
declared without restating it. Each field but the two lists also has an env spelling (`AKAN_MCP`, `AKAN_MCP_READONLY`,
`AKAN_MCP_PATH`, `AKAN_MCP_VERSION`, `AKAN_MCP_INSTRUCTIONS`, `AKAN_MCP_ALLOWED_ORIGINS`, `AKAN_MCP_PAGE_SIZE`,
`AKAN_MCP_LANGUAGE`, `AKAN_MCP_LEGACY_TEXT`, `AKAN_MCP_OUTPUT_SCHEMA`, `AKAN_MCP_RATE_LIMIT`, `AKAN_MCP_CONCURRENT`,
`AKAN_MCP_PROMPT_BUDGET`, `AKAN_MCP_APPS`, `AKAN_MCP_MODERN`, `AKAN_MCP_AUTH_SERVERS`, `AKAN_MCP_SCOPES`, `AKAN_MCP_RESOURCE`) for a deployment that configures what the source does
not, which the option overrides.
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
// <model>.signal.ts — every one of these is an MCP tool, with no `mcp:` option anywhere
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

export class TaskEndpoint extends endpoint(srv.task, ({ mutation }) => ({
  startTask: mutation(cnst.Task, { guards: [SignedIn] })
    .param("taskId", ID)
    .exec(async function (taskId) {
      return await this.taskService.startTask(taskId);
    }),
})) {}
```

```tsx
// page/task/[taskId]/_index.tsx — the screen, published to agents as the prompt `reviewTask`
export default page()
  .param("taskId", ID, { desc: "The task to review." })
  .prompt("reviewTask", "Review this task and suggest next steps.")
  .render(({ taskId }) => {
    const { taskView } = fetch.viewTask(taskId);
    return <Task.Zone.View view={taskView} />;
  });
```

## Refusals And Wire Behaviour
- **`mcp: false` is read first**, because it is the one answer nobody had to derive — somebody stated it. Its
  reason says "HTTP still serves it", because that is the sentence that stops the next reader treating it as a lock.
- **The refusals are fail-closed**: **an endpoint that declares no `guards` at all** (nobody decided who may reach
  it), **a mutation with no real `guards`** (`[Public]` is having none, spelled out — it answers true
  unconditionally), `pubsub` and `message` (their internal args read a socket an MCP request does not have), an
  `Any` or `Upload` return, a file upload, **an argument typed `Any` that must be filled**, and the generated
  **`light<Model>` read** — it returns the same document as `<Model>` under the same guards, in a shape trimmed
  for a page's payload, so publishing both put two entries per model in a listing an agent pays for every turn
  and gave it nothing but the word "light" to choose between them.
- **The boot log sizes the catalogue and says which signals it went to** — `MCP catalogue: tools=48 … · listing
  214KB` and `MCP catalogue cost: user 27/71KB · file 6/22KB · …`, heaviest first. Read it before narrowing
  anything: the number is nobody's intuition, because MCP has no shared component section and forbids a `$ref`
  across entries, so **every entry inlines the full schema of every model it mentions** and a listing is re-sent
  whole to every agent that connects, before its first turn. Past 100KB it says so as a `warn`.
- **Every refusal is named in the boot log**: one `warn` per endpoint plus a `MCP catalogue: tools=…
  resourceTemplates=…` count, and a `MCP page prompts: N (…)` line once the RSC worker has listed the pages. Read that line first when a tool you expected is missing — and it is the *only* place the answer exists,
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
  ships as the value itself either way. `resources/read` is unaffected too: `ReadResourceResult` has no
  `structuredContent`, so a resource's text is its only channel and always carries the serialized value.
- **A picture is an `ImageResult` return, and the one result a model sees rather than reads.**
  `query(ImageResult, { guards: [...] })` (or `[ImageResult]`) returns `{ data, mimeType, caption? }`: `data` is
  padded standard base64 with no `data:` prefix, `mimeType` one of `image/png`, `image/jpeg`, `image/webp`,
  `image/gif` — the types the Anthropic and OpenAI models take. `tools/call` answers the caption as a text block and
  the picture as an image block, one pair per picture, and publishes no `outputSchema` and no `structuredContent`:
  either would repeat the base64, a few hundred KB, as text the model pays for and cannot see. A value that breaks
  the shape is not sent — the dispatcher logs what an `ImageResult` needs and answers the generic failure. Put in
  the caption what the picture cannot say on its own (the region or scale it spans). Over HTTP the endpoint is the
  JSON object, so the app's own client and tests read it as usual; everywhere else an agent reads it — a page
  prompt's resource, the in-page agent — its agent face carries `mimeType` and `caption` only. Nothing caps the
  size, and Anthropic refuses an image over 5 MB, so keep a picture well under that. It is never a model field.
- **A request schema asks for a relation's id, and a response schema names a nested model.** `serialize` sends a
  relation field as its id and the server never converts an object back, so publishing the related model's shape
  asked an agent for what the document layer cannot take. On the response side every entry inlines the transitive
  closure of every model it mentions (a `$ref` may not cross entries), and on an open catalogue 83% of the bytes
  were the same schemas repeated — so by default (`outputSchema: "shallow"`) a nested database model is published
  as `{ type: "object", description: "<ModelName>" }` and the returned model keeps every field of its own; an embedded scalar stays inline. Measured,
  that took a 347-tool listing from 1194KB to 532KB, and one user's paged `tools/list` to 320KB.
  `option.setMcp({ outputSchema: "full" })` (`AKAN_MCP_OUTPUT_SCHEMA`) restores the closure; `"none"` publishes no
  `outputSchema` at all — results still ship as `structuredContent`, and the text block stays on whatever
  `legacyTextBlock` said, because a client validates structured content only against a declared schema. Inside a
  `$defs` an id carries no `pattern` and nullability rides in `type: [T, "null"]` (an enum lists `null` too); a
  top-level argument keeps the spellings the OpenAPI document uses. **Know which bytes reach the model.** The
  provider tool definition a client builds from a listing carries the name, the description and the input schema —
  the Anthropic and OpenAI tool formats have no field for an output schema — so `outputSchema` is a wire and
  client-memory cost, and the model's context is spent on names, descriptions, input schemas and the number of
  tools. Curate those (`mcp: false`, `mcp: { cru: false }`, `readOnly`) to cut context; pick `outputSchema` for the
  transfer.
  Measured on a 219-tool user listing: the wire carried 366KB, the client reported ≈41.6k tokens for it, and the
  server's own count of names + descriptions + input schemas was 95KB — the same 41k at 2.4 characters per token.
  So `outputSchema` (`full` / `shallow` / `none`) moves wire bytes and client memory and **not one model token**;
  do not tune it expecting a context win. What does cost context: the tool count, and the input model inlined
  behind every `create*` / `update*` (22 such tools were 8.7k of those 41k; the heaviest single tool was
  `updateUser` at ~900 tokens) — `mcp: { cru: false }` on a model whose writes an agent has no business with is
  the lever that pays. A custom mutation whose arguments are plain ids is cheap (nine contract tools, 1.2k). In
  one line: `Person` for an act reserved for a person, `mcp: { cru: false }` for the tools whose input models cost
  the model tokens, and `outputSchema` for nothing that reaches the model at all.
- A refused endpoint answers the *same* "unknown tool" as one that does not exist. Never make that
  message more helpful — the difference is what enumerates your private surface. Every 401 and 403 is generalized
  the same way, the framework's `Access denied by guard: Admin` and an app's `No authentication with roles: admin`
  alike: the caller reads `You are not permitted to perform this action.`, because either sentence names your
  authorization structure to the one caller barred from it. A domain `Err` at any other status resolves through
  the dictionary and keeps its own words, placeholders filled.
- The `readOnly` / `destructive` / `idempotent` hints a client renders are derived from the endpoint type and key
  and are not configurable. Clients are told to distrust hints; they are never a gate.
- **`AKAN_MCP_READONLY=true` is the read-only-deployment valve, not the exposure switch.** It drops every mutation
  whatever it declared, and reports each one in the boot log like any other refusal. It also drops each `.prompt()`
  page's text tool, whose run renders the whole page; the prompts, the `.app()` tools and their views stay.
- OAuth resource metadata is published at `/.well-known/oauth-protected-resource` (and at that path plus the mount
  path, the spelling most clients try first). `auth.authorizationServers` / `AKAN_MCP_AUTH_SERVERS`,
  `auth.scopes` / `AKAN_MCP_SCOPES`, `auth.resource` / `AKAN_MCP_RESOURCE` and `auth.verify` configure it;
  `insufficient_scope` is enforced only once scopes are declared. Declare them only for tokens an external issuer
  mints: the built-in authorization server's tokens carry no scope, so beside it every one of them would be refused
  with 403. Naming an issuer changes three things at once: a request with no credential is answered 401 from
  `initialize` on (an MCP client starts its OAuth flow on nothing else), a token carrying no `aud` is refused (that
  issuer mints for its other resources too), and the challenge carries no `error` code (RFC 6750 §3.1 reserves it
  for a credential that was presented). A server naming no issuer keeps anonymous access and accepts a first-party
  token, which is bound by app and environment instead.
- **The boot log names every published entry with no dictionary `.desc()`.** An agent picks a tool by its
  description, so a missing one is a broken tool. What the framework generates has no text of its own and borrows
  the model's: the generated list reads the `.of()` label, and the base CRUD tools append the model's `.desc()` to
  their generated `Get X`. Write that model `.desc()` — it is the only text those entries can carry. There is no
  `akan quality scan` rule for this any more: a source scanner found the exposure only as an `mcp:` literal, and
  with exposure derived from the guards the resolved catalogue is the only place that can answer.
- A browser-hosted client needs `allowedOrigins` **and** the CORS answer the server sends back for those origins.
  Every other MCP client sends no `Origin` at all, and the one that does is matched against the server's public
  origin: the configured `auth.resource`'s when there is one (`libs/shared` derives it from the issuer, so a mounted
  app is always pinned), and only otherwise the forwarded host — which is as trustworthy as an edge that
  *overwrites* that header. The same origin names the `resource_metadata` URL in every 401 challenge.
  `AKAN_MCP_RESOURCE` is the pin for an app that mounts no authorization server.
- **Every call that executes an endpoint is rate-limited per caller** — `tools/call`, `resources/read` and
  `prompts/get`, never a listing. A caller is the bearer's session (`sid`), so one connector counts as one however
  many connections it opens; a credential-less caller is the address the proxy recorded, and callers with none share
  one bucket. Defaults are 120 calls a minute and 8 in flight, counted per process (N replicas grant N budgets); past
  either the answer is HTTP 429 with JSON-RPC `-32010` and a `Retry-After`, and an unknown tool name is counted like
  any other call. `option.setMcp({ rateLimit: { calls, windowMs, concurrent } })`, `rateLimit: false` to turn it off;
  `AKAN_MCP_RATE_LIMIT=<calls>` or `<calls>/<seconds>` (`off` disables) and `AKAN_MCP_CONCURRENT`. The boot log says
  which is in force, and warns when it is off.
- **A `resources/read` uri that does not decode** — a stray `%` — is `Unknown resource`, not a server failure.
- **A caller's own mistake is reported as one** and never as a server failure: an argument that is missing,
  unparseable, outside its `enumOf`, or **undeclared** comes back as `isError` naming it — `additionalProperties: false` travels in the
  published schema and nothing on the wire enforces it — and so does a document that is not there, as
  `No <model> found for the arguments given.`, and an MCP App view also receives the 404 `base.error.documentNotFound`
  `Err` a browser would get. A prompt, having no `isError` to carry a refusal, answers `-32602`.
  A document missing on another server this one called (`fetch.clone({ origin })`) arrives as that server's 404
  `base.error.documentNotFound`, so a tool reads its dictionary sentence (`The requested item does not exist.`) and an
  MCP App view receives that `Err`; a prompt whose page reads it is `No screen exists for these arguments.`
  Only a real failure logs a stack; an agent can drive the rest at will.
- **Every failed call carries a code** beside the text, which reads as it always did. A tool error holds
  `_meta["akanjs/failure"]: { code, statusCode }` — in `_meta`, because a client checks `structuredContent` against
  the tool's `outputSchema` even on a failure — and a JSON-RPC error holds `data.code`, which tells apart what
  `-32602` files together: `unknownTool`, `invalidArgument`, `unknownPrompt`, `unknownResource` and a screen's
  refusal, beside `tooManyRequests` and `internalError`. The code is the one an HTTP caller gets: a domain `Err`'s
  dictionary key (what `Err.is` matches), else the `AkanError`'s own code; a guard's 401 or 403 by its status alone
  (`unauthorized`, `forbidden`), since a guard's own code names its rule as its message does; a crash, or a 5xx whose
  code this server did not name, by its status (`internalError`). A code is a bounded key or camelCase token, never
  prose. No host hands `_meta` to the model, so what the model must act on belongs in the dictionary sentence.
- **Three revisions are spoken**: the modern `2026-07-28` and the legacy `2025-11-25` / `2025-06-18`, which are
  wire-identical over the POST-only surface this implements — a client whose proposal is not listed is told to
  disconnect. An unknown proposal is answered at whichever end of that list it is closer to, and an unimplemented
  method answers `404` to a modern client but `200` to a legacy one, whose era spends `404` on "your session is
  gone". **While an `.app()` may show as a view only the legacy pair is spoken**: `server/discover` answers
  `-32601` and `initialize` settles on `2025-11-25`, because claude.ai renders a view only for a server it reached
  through `initialize`. An app that renders no view, or whose RSC worker lists no `.app()`, speaks all three.
  `modern: true` / `AKAN_MCP_MODERN=true` offers `2026-07-28` anyway; `false` withholds it everywhere.
- **A modern-era request mirrors `MCP-Protocol-Version` and `Mcp-Method` into headers** (plus `Mcp-Name` when the
  body names one), and one that leaves a mirror out is refused just like one that contradicts the body: a gateway
  rule keyed on a header never fires for the request that omitted it. Legacy requests are not checked. Capabilities
  are derived from the catalogue; `prompts` is advertised when the build serves pages, since prompts are theirs.
- **An expired, wrongly-audienced or unverifiable bearer token is refused up front**, so an agent is told to
  authenticate rather than that the tool does not exist. The signature is checked through `auth.verify`, which the
  module that mints the tokens supplies (`libs/shared` does, from the app's signing secret); without a verifier the
  claims are read unverified and a token signed wrong, like an opaque one, degrades to an anonymous caller.
- **`/mcp` reads the `Authorization` header and nothing else.** The `cookie` header is deleted from the request
  before the account middleware runs, so a same-site page cannot drive `tools/call` on the visitor's ambient session
  — the request class `CrossSiteGuard` shields every mutation from, which this route never passes through.
- **Resource URIs**: `akan://<model>/{id}`, `akan://<model>/list` for the model's own list, and
  `akan://<model>/list/<sliceKey>` for a slice's. The root list takes no third segment on purpose — any token
  there is one a slice could also be named. **Those three are the whole set**, so only the generated reads that
  publish are addressable: a custom endpoint keeps its tool and gets no resource template, and the refused
  `light<Model>` read has no address either.
- **The catalogue is one language**, `en` unless `language` says otherwise: it is built once at boot and cached by
  clients, so there is no `Accept-Language` negotiation.
