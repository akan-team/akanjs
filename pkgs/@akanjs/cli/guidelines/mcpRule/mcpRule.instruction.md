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
  only thing deciding who may call it. Never write `mcp: false` where you meant a guard.
- **The `mcp` map on `slice()` mirrors the `guards` map above it** — same keys (`root`, `get`, `cru`, `create`,
  `update`, `remove`), same fallbacks (`create`/`update`/`remove` inherit `cru`), and the same scope: it narrows
  the root slice and the generated CRUD, and never reaches a named slice or a custom endpoint. Those declare
  their own `mcp` beside their own `guards`. The bare `mcp: false` is every key at once, still within that scope.
- **A screen keeps reaching it.** To a host that renders MCP Apps views, an endpoint refused for `mcp: false` alone
  is published with `visibility: ["app"]`: the view the page tool opens may call it, the model is never shown it
  (below). Every other refusal still holds there.
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
`promptBudget`, `apps`, `modern`, and `auth`. **Not `main.ts`**: the gateway
there only spawns children, and `option.ts` is the app-authored file `server.ts` already hands to the process that
mounts `/mcp`. Every lib's option is read in mount order with the app's last, so an app tightens what a library
declared without restating it. Each field also has an env spelling (`AKAN_MCP`, `AKAN_MCP_READONLY`,
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
  were the same schemas repeated — so a nested database model is published as `{ type: "object", description:
  "<ModelName>" }` and the returned model keeps every field of its own; an embedded scalar stays inline. Measured,
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
  whatever it declared, and reports each one in the boot log like any other refusal.
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
  `No <model> found for the arguments given.` A prompt, having no `isError` to carry a refusal, answers `-32602`.
  Only a real failure logs a stack; an agent can drive the rest at will.
- **Three revisions are spoken**: the modern `2026-07-28` and the legacy `2025-11-25` / `2025-06-18`, which are
  wire-identical over the POST-only surface this implements — a client whose proposal is not listed is told to
  disconnect. An unknown proposal is answered at whichever end of that list it is closer to, and an unimplemented
  method answers `404` to a modern client but `200` to a legacy one, whose era spends `404` on "your session is
  gone". **While a `.prompt()` page may show as a view only the legacy pair is spoken**: `server/discover` answers
  `-32601` and `initialize` settles on `2025-11-25`, because claude.ai renders a view only for a server it reached
  through `initialize`. An app that renders no view, or whose RSC worker lists no `.prompt()` page, speaks all three.
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

## Authentication — The Authorization Server Is The Same Process

`libs/shared/lib/_oauth` is an OAuth 2.1 authorization server (RFC 8414 metadata, PKCE `S256` only, RFC 7591
registration, Client ID Metadata Documents, RFC 9207 `iss`) served by the app that serves `/mcp`. Its `option.ts`
names the issuer and hands `McpAuth` a verifier, so mounting the lib is all an app does; the protocol engine it
delegates to lives in `akanjs/server` (`OAuthAuthorize`, `OAuthToken`, `OAuthRegistration`, `OAuthClientIdMetadata`,
`OAuthPkce`, `OAuthRedirect`, `OAuthMetadata`, `OAuthErrors`) and is unit-tested without a container.

- **Endpoints, at the origin's root:** `GET /.well-known/oauth-authorization-server`, `GET /oauth/authorize`,
  `POST /oauth/token` (form-encoded), `POST /oauth/register`, `POST /oauth/revoke` (RFC 7009, form-encoded, the
  same client authentication as the token endpoint). The consent step is `libs/shared/page/oauth/consent`
  — a server-rendered page whose two forms post to `/api/approveOAuthConsent/<requestId>` and
  `/api/denyOAuthConsent/<requestId>` and follow the 302 back to the client. The account's own controls are
  `fetch.listOAuthConnections()` (one entry per live grant: `sessionId`, `clientId`, `clientName`, `userAgent`,
  `createdAt`, `expiresAt`, `isCurrent`) and `fetch.revokeOAuthConnection(sessionId)`; the app renders the
  connected-apps page, the lib supplies the two endpoints and the `oauth.connectedApps` / `disconnect` /
  `noConnectedApps` / `currentConnection` translations. All of it is `mcp: false`.
- **Revocation closes a grant, not a token.** A refresh token or an access token both name one grant (the access
  token carries the lineage as `sid`); revoking either closes the refresh lineage and denylists the lineage id for
  an access token's lifetime, so a stateless token dies early — `/mcp` answers 401 `invalid_token` and
  `AccountMiddleware` treats it as anonymous, at the next call. `/oauth/revoke` answers an empty 200 whether the token
  was live, unknown, or another client's (RFC 7009 §2.2 — it must not double as a token oracle); only a failed client
  authentication is 401. Changing a password still revokes every session, browser ones included; disconnecting an
  app revokes that one.
- **A person may, a model may not.** The one honest marker of "a model is driving this call" is on the token: an
  access token minted here names its `client_id` and the MCP resource as `aud`, and a browser session carries
  neither; `SerAccount` declares those claims, so nothing casts to read them. Read it three ways, all in
  `@libs/shared/srvkit`: `.with(AgentCall)` hands the endpoint a boolean (drop `sendEmails` on an agent's say-so);
  `guards: [Every, Person]` refuses a model outright and, being `account`-scoped, hides the entry from every MCP
  listing (signing, paying, anything the page treats as a deliberate act); `isAgentCall(context)` inside a guard or
  service. All three read `context.origin === "mcp"` first — a field on `SignalContext`, never the trace, which can
  be absent — and the token second, so an agent's token used over plain HTTP is still an agent. `Person` also
  declares **`static agents = false`**, the guard-level marker the catalogue reads: an endpoint it guards is refused
  from the document itself (named in the boot log like `mcp: false`, with the guards' `static name`s — the explorer's
  filter labels, which need not be the class names), not merely
  hidden per caller at listing time — so the boot count, the size line and every agent's listing agree, and no
  second flag is needed. Any guard that admits no model may declare the marker; a listing still evaluates
  `account`-scoped guards per caller, so the two mechanisms compose.
- **The flow:** `POST /mcp` with no token → 401 with `resource_metadata` → the client reads the PRM, then the AS
  metadata, registers (or uses a pre-registered / URL `client_id`), opens `/oauth/authorize` in a browser → the
  server parks the request and redirects to the consent page (via `signinPath?redirect=` when anonymous) → the user
  allows → `redirect_uri?code&state&iss` → the client posts the code and its PKCE verifier to `/oauth/token` → an
  access token (1h, `aud` = the MCP resource, `iss`, `client_id`, `sub`, and the account's `self`/`me`) plus a
  rotating refresh token (30d; reuse revokes the family). The token is the app's own access JWT, so
  `AccountMiddleware` and every guard read it exactly as a browser session; nothing is scoped.
- **Invariants:** an authorization request lives ten minutes, binds to the first signed-in account that opens it,
  and is decided once; a code lives sixty seconds and is consumed on first exchange even if that exchange fails; a
  redirect URI must be registered and match exactly, loopback ports excepted (RFC 8252 §7.3); a refresh token is
  bound to the client it was issued to. A `client_id` that is an HTTPS URL with a path is fetched as a metadata
  document: the name is judged first (no address literal, no reserved suffix, no port), then resolved, and refused
  when any address is private, loopback, link-local, CGNAT or multicast — the rebinding window between lookup and
  fetch is what the deployment's egress policy still owns.
- **Per-app configuration** goes in `env.server.*` under `oauth`: `consentPath` and `signinPath` (with the basePath
  when the app has one — `/office/oauth/consent`), `clients` (pre-registered, with an optional `clientSecret`),
  `dynamicRegistration` (on by default: Claude Code and claude.ai register themselves), `allowedRedirectSchemes`
  (`["cursor"]` by default, for Cursor's desktop callback), `accessTokenSeconds` (3600, also how long a revoked
  access token can outlive its grant), `clientIdMetadata: { enabled, refusePrivateAddresses }` (both on; `enabled:
  false` turns Client ID Metadata Documents off and the metadata stops advertising them — Claude Code then registers
  dynamically instead), `issuer` and `resource` (only when a tunnel or an edge makes the derived origin wrong),
  `enabled: false` to take the server and the `/mcp` credential requirement away together. The signin page must
  honour `?redirect=` to return the user to the consent page.
- **Clients:** Claude Code — `claude mcp add --transport http <name> <origin>/mcp` and nothing else; it registers,
  opens the browser to `http://localhost:<port>/callback`, refreshes on 401. claude.ai — a custom connector by URL
  (needs public HTTPS; DCR or the Advanced-settings client id/secret; callback
  `https://claude.ai/api/mcp/auth_callback`). Cursor — the URL alone (DCR with a `cursor://` redirect), or a
  pre-registered client in `mcp.json` `auth` with `http://localhost:8787/callback` /
  `https://www.cursor.com/agents/mcp/oauth/callback` registered. A first-party browser token no longer opens `/mcp`
  once the issuer is named; `--header "Authorization: Bearer …"` needs a token minted with `aud`.
- **`JWT_SECRET`** (or `security.jwtSecret`) is required outside `local`; the boot refuses without it, because the
  derived fallback is seeded from the app, environment and repo names and forges an admin token for anyone who
  knows them. `AKAN_ALLOW_DERIVED_JWT_SECRET=1` accepts that risk explicitly.

## Page Prompts — `page().prompt()`
**A prompt is a screen.** There is no `prompt()` on `endpoint()`: the page file declares it —
`page().param("projectId", ID, { desc: "The project to brief." }).prompt("briefProjectTickets", "Brief the ticket
board of one project.").render(…)` — and that is the whole surface. `prompts/list` is every page carrying
`.prompt()`; its `.param()` stages are the required arguments and its `.search()` stages the optional ones, a list
argument is comma-separated on the wire and its description says so, and an `ID`/`Int`/`enumOf` value is checked by
the page's own declaration. **`prompts/get` runs the page's body** — root layouts, layouts, then the page's
`.render()` — in the RSC worker under the caller's bearer token, the way a tab would open it. Nothing is rendered:
the JSX comes back as an element tree nobody walks, no client component runs, and the screen's data footprint is
exactly the `fetch.*` queries its body made, with the arguments it made them with. The answer is the description as
the first message (priority 1), one embedded `resource` per query masked by that endpoint's return model and
addressed by the `akan://` uri the tool answers to (`akan://<toolKey>?args` for a custom read) — one document read
in two shapes, a layout's `project` beside the page's `lightProject`, travels once as the larger — and a closing
`Tools for this screen: …` line naming the published tools of the modules the screen fetched from, minus the reads
whose answers are attached above and filtered to what this caller may see — which is how a model reading a ticket
board is handed the ticket tools and not three hundred. Lists are cut to `promptBudget` (60,000 characters;
`option.setMcp({ promptBudget })`, `AKAN_MCP_PROMPT_BUDGET`), largest first, and the cut is said: `Attached the
first 20 of 341 rows of \`ticketListInProject\`; call it for the rest.` Only lists are cut — a single document rides
whole, so the budget is what the lists are trimmed to fit under, not a ceiling a screen of large documents cannot
pass. A layout's own queries (a project selector's `projectListInOrg`) are part of every screen under it and are
attached too. **No argument fallback**: a required argument left out answers one message — `No projectId was named for
"briefProjectTickets". Find it with \`projectListBySearch\`, then run this prompt again with projectId=<id>.` —
and runs nothing, because a prompt cannot re-run itself and context filled in on a guess would never be used. A
page that redirects (`getSelf({ unauthorize })`), or whose `fetch.*` a guard refuses with 401/403, answers the 401
credential challenge when the call carried no token and `This screen is not available to the signed-in account.`
when it did — the same sentence for both, so a refused id is never confirmed to exist; `router.notFound()` and a
404 from a query are `No screen exists for these arguments.`; anything else the body throws is `The page failed to
load.`, with the cause in the server log only. **The description is the only instruction.** `<Agent.Guide>` is for the in-page agent, whose
levers are the screen's controls, and is never read here, where the levers are the API — so write the description
in English, in the API's vocabulary, and put a computed rule (the legal status transitions) into it as a static
table the model combines with the attached state. Names match `^[A-Za-z0-9_-]{1,64}$` and are unique across pages;
two pages claiming one name fail the listing. An API-only build (`web: false`) publishes no prompts, and the
in-page chat lists none of them: its `/` menu is its six built-in commands. Pick which screens to publish by this
rule: a page taking no arguments is the most useful prompt, since MCP has no completion — one taking an id is for
when the id is already in hand.

## MCP Apps — The Page, Rendered In The Chat
**A `.prompt()` page is also a tool**, of the same name and arguments, marked `readOnlyHint: false`, since running
the page makes its own `fetch.*` calls, mutations included. Its result is the
prompt's briefing plus `Open this screen in a browser: <url>` — what a client without the
`io.modelcontextprotocol/ui` extension (Claude Code, Codex) reads. A host that declares the extension (claude.ai,
Claude Desktop, ChatGPT, VS Code, Goose) is also given `_meta.ui.resourceUri` (`ui://<app>/app`, or
`ui://<app>/app/<basePath>`) and renders the screen in place of the result: the app's CSR bundle, one HTML document,
in a sandboxed iframe started on the page the tool ran. Its first queries are answered from that run — carried in
the result's `_meta`, the one part no host shows the model — so the first paint costs no round trip; every later
call is relayed by the host as `tools/call` under the host's token. Nothing is declared for any of it.

- **What a view may call** is every published tool, and every endpoint kept off the shelf by `mcp: false` alone or
  the generated `light<Model>` read, listed with `visibility: ["app"]` — which a host offers to the view and never to
  the model; a `Person` guard still refuses one. Visibility is a host's UX, not authorization: the guards decide, as
  everywhere. A client that did not declare the extension is listed neither those tools nor the `ui://` resources, a
  call to one answers `Unknown tool`, and a page tool's result carries none of the view's data for it.
- **The capability is read per request.** A legacy client declares it once at `initialize` and is issued an
  `Mcp-Session-Id` (`ui.<nonce>.<signature>`) that stores nothing: the app signs it, and an id the app did not sign is
  served as a client without views. With `modern: true` a modern request carries the capability in `_meta`. A client
  that declares nothing is issued no session, exactly as before.
- **A read-only deployment has no MCP Apps.** With `readOnly` / `AKAN_MCP_READONLY` there are no page tools, app-only
  tools, views or UI sessions, since running a page makes its own `fetch.*` calls, mutations included.
- **The view is the page, not the app around it.** Each layout above it still runs — guards, providers,
  `<Agent.Guide>` — but what it draws around `{children}` is hidden, with its frame chrome (`Layout.Navbar`,
  `TopInset`, `BottomInset`, `BottomTab`), the `topInset` / `bottomInset` it reserves and the tools its controls
  publish. A layout that draws no page, like a gate, is the screen then and is shown. The screen the view opened on
  has no back button: there is nothing behind it.
- **The view has no network.** `connect-src` stays closed; the app's own origin is opened for what a page loads by
  URL — fonts (served with `Access-Control-Allow-Origin: *`) and stored images — and every root-relative URL the
  page writes is pointed at it, since a host may block the document's `<base>` (Claude does).
  Cookies and Web Storage are in-memory, history is in-memory, and the websocket, live sync, pubsub, the reconnect
  overlay and `<Agent.Chat />` are off. A path link routes inside the view; any other link opens through the host.
- **The view looks like the host.** Its neutrals (`--background`, `--foreground`, `--muted`, `--border`, `--ring`) and
  `--font-sans` / `--font-mono` follow the host's theme variables, its theme follows the host's, and so does its
  language when the app speaks it; the app's brand colors and radii stay its own.
- **The host's model drives the screen too.** The view offers the host the screen's own tools — the surface
  `<Agent.Chat />` reads: `st.tool`, the form setters, `fill<Model>Form`, `navigate` / `readScreen` / `readState` /
  `highlight` — and, to a host that takes it, the screen's context (route, live state, `<Agent.Guide>`) through
  `ui/update-model-context` whenever it moves. A tool that declares `confirm` asks the person in the view through
  the `AgentApproval` slot, whatever the host asks on its own; a card tool, which a person answers in a chat, is not
  offered.
- **A person tapping in the view acts with the agent's token**, so `isAgentCall` is true and a `Person` act is
  refused there. That act belongs on the web page the result links to. The view holds no token: it is handed the
  caller's claims, so `getSelf({ unauthorize })` in a layout renders the screen instead of a sign-in page, and each
  call it makes is relayed and judged by the guards.
- **A view's call answers what a browser would get**, in `_meta` beside the masked result: the value with its
  `visual` fields, or the domain `Err` with its key and data, toasted in the user's language. A refusal and a crash
  stay generalized.
- **What a document load would do, the view does in place.** `router.refresh()` renders the route afresh, a
  download (`<a download>`, a data table's export) goes to a host that saves files, and a full navigation off the
  app shows a notice instead of a blank frame.
- **A page named like an endpoint stays a prompt only**, published or not, and the boot log says so: the endpoint
  keeps its name. A refused screen answers as a tool error (`isError`), which the model reads.
- `option.setMcp({ apps: false })` / `AKAN_MCP_APPS=false` keeps every page a prompt only. `web: { csr: false }`
  publishes the tool with no view, and an API-only build (`web: false`) has no pages to publish.

## Progress Reporting
**`McpProgress.report(n, { total, message })`** reports progress from anywhere inside a call, a service or adapter
frames down included, and is a no-op when nobody is streaming — so the same code runs unchanged over HTTP, a
websocket, and in tests. `McpProgress.streaming` says whether anyone is reading, for a report whose message
costs something to assemble.

## Rolling MCP Out To An App

The goal of exposing a service over MCP is that a person uses it through an agent instead of through the page:
one browser consent (the app's own sign-in included), then an hour-long access token and a thirty-day rotating
refresh token stand in for every later sign-in. The token is the app's own access JWT, so what an agent may do is
exactly what that person may do over HTTP — nothing is widened and nothing is scoped. Do these in order; steps 2
and 3 are the ones whose omission shows up as a 404 or a doubled basePath on the consent page.

1. **Mount the lib that carries the authorization server** (`libs/shared`) and confirm `lib/_oauth`,
   `page/oauth/consent` and `srvkit/oauthServer.ts` are present. Its `option.ts` declares `auth` for `setMcp`, and
   `setMcp` merges field by field in mount order with the app last — the app never restates `auth`.
2. **`akan.config.ts`: `syncPageLibs: true`** (or the lib's name in an array). `akan sync <app>` links the consent
   route under every basePath the app declares; the link folder is generated and never committed.
3. **`env.server.*` → `oauth`.** `consentPath` / `signinPath` carry the basePath the browser sees
   (`/office/oauth/consent`, `/office/signin`) and are omitted for an app without one. The server hands the
   sign-in page `?redirect=` as the app's router names the route — basePath removed — because `router.push` puts
   the locale and basePath back; the app adds nothing. `issuer` (`AKAN_MCP_AUTH_SERVERS` for the resource side)
   only behind a tunnel or an edge that renames the host, `resource` (`AKAN_MCP_RESOURCE`) only when `path` moved
   off `/mcp`, `clients` + `dynamicRegistration: false` only for a deployment that closes registration.
4. **The sign-in page honours `?redirect=`** by passing it unchanged to the password and SSO controls — a
   router-space path, never prefixed by hand. Accepting it needs only `startsWith("/") && !startsWith("//")`.
5. **`lib/option.ts`: `option.setMcp({ instructions, legacyTextBlock: false })`** (`AKAN_MCP_INSTRUCTIONS`,
   `AKAN_MCP_LEGACY_TEXT`). Leave `readOnly` (`AKAN_MCP_READONLY`) off when the point is to let people *use* the
   service; it is the valve for a deployment that must not write, not the way to curate.
6. **`JWT_SECRET`** (or `security.jwtSecret`) in every deployment outside `local`; the boot refuses without it.
7. **Read the boot log** — `MCP catalogue: tools=… · listing …KB`, the `MCP catalogue cost:` line, one `warn` per
   refusal, and the list of published entries with no `.desc()`. A tool missing from it is missing everywhere.
8. **Connect once per app** — `claude mcp add --transport http <name> <issuer>/mcp`; a second entry for the same
   server with a pre-registered client tests a registration mode, it does not add anything a user needs.

## Choosing What To Open

One rule: **an endpoint is open to an agent when the same person could do the same thing from the page, under
the same guards.** What stays closed is closed because no agent has a reason to call it, not because of who may
— and that is the only thing `mcp: false` says.

| Endpoint | Decision |
|---|---|
| Domain read slices (`inOrg`, `inProject`, `inSelf`, `byStatuses`) | Open. A named slice publishes only when it declares its **own** `guards`; the `slice()` map reaches the root slice and the generated CRUD, never a named slice. A search slice only on data that may be enumerated. |
| The root slice and generated CRUD | Published by default; `root:` is `Admin`, so a user token never lists it. Take the cost line first: `mcp: { cru: false }` keeps the reads and drops the writes of a model whose write entries are most of its bytes; `mcp: false` for an internal or sensitive model. |
| Domain mutations (`startTask`, `completeTicket`) | Open when a person would ask an agent to do it for them; a resource guard is mandatory. An act that cannot be undone — signing, paying, sending, removing — either stays off or says so in its `.desc()`: MCP has no approval card. |
| Steps of a UI state machine (`requestPhoneCodeForSignin`, `setPasswordInPrepareUser`, a prepare-user flow) | `mcp: false`. Perfectly guarded, and only ever called by mistake. |
| Authentication, SSO, and the OAuth protocol endpoints | Already `mcp: false` where they are declared. |
| File upload, an `Any` / `Upload` return, a required `Any` argument, `pubsub` / `message`, `light<Model>` | Refused by the framework; nothing to write. |
| Admin-only endpoints | Leave the `Admin` guard; an account-scope guard hides the entry from every caller it refuses. |
| An act only a person may take (signing, paying, sending to a customer) | `guards: [Every, Person]` refuses every agent and, because `Person` declares `static agents = false`, takes the entry out of the catalogue document — no `mcp: false` needed, the HTTP route untouched. When a person and a model may both call but not to the same effect, keep the guards and take `.with(AgentCall)` to narrow what the call sets in motion. |

- **Scope is what makes hiding possible.** `static scope: "account"` (a role check) is evaluated with no arguments
  and filters the listing per caller; `"resource"` (`Can<Verb><Model>`, ownership) needs `context.getArg()`, stays
  listed, and stops the call. Marking a resource guard `"account"` would make the listing lie — the marker has no
  default for that reason.
- **Identity comes from the internal args** (`.with(Self)`, `.with(Account)`, `.with(Me)`), never from an id the
  client sent, and the service re-checks ownership behind the guard.
- **An admin who signs in on the consent page mints an admin token.** A connector created under an admin account
  passes `Admin` guards; treat that as an operational decision, and read the request's subject type when in doubt.
- **Return what answers the question.** A count-or-summary endpoint taking an id beats a document; a nullable model
  return publishes no `outputSchema`, so prefer a non-null return plus an `Err`. Bulky page-only fields are
  `field.visual`. Narrow a list with a named filter slice, never with the root list's raw `query`.

## Writing `instructions`

`*.abstract.md` never reaches an MCP client, and `<Agent.Guide>` only through an MCP Apps view, beside the screen's own
tools it explains. Exactly three texts reach every client: `instructions`, every published entry's `.desc()`, and a
page's `.prompt()` description. All three are English, whatever the users speak
— the reader is a model, and the catalogue is built once in one `language` and cached by clients.

- **`instructions` is the workflow.** Five to eight sentences, in this order: what the app is and what its nouns
  mean; **which tool to call first** and which ids the rest take; how a name becomes an id; what a write confirms
  before it runs and which writes cannot be undone; what this server does *not* do and where that is done instead.

  ```ts
  instructions: [
    "Operations tools for a back-office that runs consulting projects.",
    "An org is one company; a project belongs to an org; a ticket is one unit of work on a project.",
    "Start from orgInSelf, then projectInOrg and ticketInProject; every other tool takes the ids those return.",
    "Prefer ticketStatusInProject for 'how is it going' and ticketInProject only when the user asks for detail.",
    "createTicket, startTicket and completeTicket write on the caller's behalf: confirm the project and title first.",
    "Nothing here signs, invoices or uploads a file; those are deliberate acts on the record's own page.",
  ].join(" "),
  ```
- **`.desc()` is the reason to pick one tool** — what it returns and when to use it, two clauses. An id argument's
  `.desc()` names the tool that returns it (`From projectInOrg`). The generated CRUD borrows the model's `.of()`
  label and `.desc()`, which is the only text those entries can carry.
- **A page prompt is a workflow the user invokes** as a slash command, not one the model chooses — a weekly
  report, an onboarding check. Its instruction is the `.prompt()` description alone and its attachments are what
  the screen fetched, masked by their return models — so to change what a prompt hands the model, change what the
  screen loads, and keep the description to the ask.

## Verifying An App

- `akan lint <app>`, `akan typecheck <app>`, `akan sync <app>`, then the boot log above.
- The lib's own suites run wherever it is mounted: the OAuth signal test (metadata, registration, both `authorize`
  redirects, code exchange, `/mcp` with the minted token and the refusal of a first-party or forged one, refresh
  rotation) and the refresh-session and option unit tests.
- **One exposure test per app**, in `srvkit/mcpExposure.signal.test.ts`, since it spans every module: list
  `tools/list` with a user token and pin the names with `toEqual`, and assert the curated and admin-only ones with
  `not.toContain`. Exposure is derived from the guards, so a guard change fails this test first — which is the point.
  The framework's own pattern is `pkgs/akanjs/server/mcp/mcp.integration.test.ts`.
- Live: connect a client, consent, call a tool, `claude mcp logout`, authenticate again. `AKAN_PUBLIC_LOG_LEVEL=debug`
  prints one `OAuth token request grant_type=… client_id=…` line per token call; two refreshes in the same second
  both answering 200 is the grace window working, not a fault.
