<!-- akan:generated -->

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
  dynamically instead), `issuer` and `resource` (only when a tunnel or an edge makes the derived origin wrong, since
  an MCP client compares the issuer byte for byte), `enabled: false` to take the server and the `/mcp` credential
  requirement away together. The signin page must honour `?redirect=` to return the user to the consent page.
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
the page's own declaration. `prompts/list` shows only the screens whose route `.guard()`s admit the caller; a listing
knows no arguments, so a guard that reads one admits there and is checked again on the call. **`prompts/get` runs the
route's guards, then the page's body** — root layouts, layouts, then the page's `.render()` — in the RSC worker under
the caller's bearer token, the way a tab would open it. Nothing is rendered:
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
page that redirects (a `.guard()`, `getSelf({ unauthorize })`), or whose `fetch.*` a guard refuses with 401/403, answers the 401
credential challenge when the call carried no token and `This screen is not available to the signed-in account.`
when it did — the same sentence for both, so a refused id is never confirmed to exist; `router.notFound()` and a
404 from a query are `No screen exists for these arguments.`; anything else the body throws is `The page failed to
load.`, with the cause in the server log only. **The description is the only instruction.** `<Agent.Guide>` is for the in-page agent, whose
levers are the screen's controls, and is never read here, where the levers are the API — so write the description
in English, in the API's vocabulary, and put a computed rule (the legal status transitions) into it as a static
table the model combines with the attached state. Names match `^[A-Za-z0-9_-]{1,64}$` and share one namespace with
every page's `.app()`s; two pages claiming one name fail the listing. An API-only build (`web: false`) publishes no prompts, and the
in-page chat lists none of them: its `/` menu is its six built-in commands. Pick which screens to publish by this
rule: a page taking no arguments is the most useful prompt, since MCP has no completion — one taking an id is for
when the id is already in hand.

## MCP Apps — One Component Of A Page, Drawn In The Chat
**`page().app(name, description, load)` publishes one component of a screen.** `load` takes the page's typed
arguments and `lang` and returns the element — usually a `Zone` fed by unawaited `fetch.*` fields — and on the web that
element reaches `.render()` as the argument named `name`, so the page draws it where it belongs:

```tsx
export default page()
  .param("ticketId", ID, { desc: "The ticket to show." })
  .app("showTicket", "Show one ticket with its status and assignee.", ({ ticketId }) => {
    const { ticketView } = fetch.viewTicket(ticketId);
    return <Ticket.Zone.View view={ticketView} />;
  })
  .render(({ ticketId, showTicket }) => (
    <div className="flex flex-col gap-4">
      {showTicket}
      <Ticket.Util.Close ticketId={ticketId} />
    </div>
  ));
```

- **Each app is a read-only tool** of its name, whose arguments are the page's `.param()` (required) and `.search()`
  (optional) stages, marked `readOnlyHint: true`. A call checks the arguments, runs the route's `.guard()`s, then the
  app's `load` alone — no layout body, no `.render()` — and answers the briefing a prompt would give for what that load
  fetched, plus `Open the full screen: <url>`: what a client without the `io.modelcontextprotocol/ui` extension
  (Claude Code, Codex) reads. A refusal is a tool error with the prompt's sentences. Several apps may sit on one page;
  names share one namespace with the prompts, and an endpoint keeps its name over an app's, with a boot warning.
- **`load` may only query.** A mutation, a file upload, a room subscription or a message sent while it runs throws
  `base.error.mutationInApp` before anything is sent — on the server through every `await`, in a browser for its
  synchronous part, `{ duringRender: true }` or not. The buttons and forms that write stay in `.render()` around the
  element (the `Close` above), and gating stays in `.guard()`: a `getSelf({ unauthorize })` inside `load` would
  redirect a view.
- **A host that declares the extension** (claude.ai, Claude Desktop, ChatGPT, VS Code, Goose) is also given
  `_meta.ui.resourceUri` (`ui://<app>/apps/<name>`) and draws the app's own view in place of the result: one HTML
  document per app, which `akan build` writes to `mcp-apps/<name>.html` beside `csr/` and `akan start` writes to
  `.akan/artifact/mcp-apps/` when a host first reads it. The view runs `load` again with the route values the result
  names in `structuredContent`, and its first queries are answered from that call — carried in the result's `_meta`,
  the one part no host shows the model — so the first paint costs no round trip; every later call is relayed by the
  host as `tools/call` under the host's token.
- **The view is the component, not the page.** It bundles the page with `.render()`, `.head()`, `.loading()` and
  `.guard()` blanked, so it carries what the loads reach and nothing else, and draws the element inside the
  `_overrides.tsx` over the page and the root layout's `McpAppRoot` (`System.App`: its theme, fonts and providers, with
  no frame, router or websocket). An `_overrides.tsx` the web draws outside the root layout (on its folder, or on one
  above it with no layout of its own) wraps `McpAppRoot`, so the toasts and approvals it draws take it too. No layout
  body runs there, so a layout's `<Agent.Guide>` never reaches the host; one inside the element does. A view never
  moves: a link or `router.push` to one of the app's screens opens that screen's web page through the host (basePath
  kept), a fragment of its own screen scrolls it, and `router.back()` / `router.refresh()` do nothing. A host loads one
  file, so every `lazy(() => import(…))` the loads render is inlined; the view build marks a `const X = lazy(…)` pure,
  so a barrel's, the page's own that only `.render()` drew, or an override manifest's that nothing renders is dropped,
  while a `lazy()` called anywhere else stays.
- **What a view may call** is every published tool, and every endpoint kept off the shelf by `mcp: false` alone or
  the generated `light<Model>` read, listed with `visibility: ["app"]` — which a host offers to the view and never to
  the model; a `Person` guard still refuses one. Visibility is a host's UX, not authorization: the guards decide, as
  everywhere. A client that did not declare the extension is listed neither those tools nor the `ui://` resources, a
  call to one answers `Unknown tool`, and an app tool's result carries none of the view's data for it.
- **The capability is read per request.** A legacy client declares it once at `initialize` and is issued an
  `Mcp-Session-Id` (`ui.<nonce>.<signature>`) that stores nothing: the app signs it, and an id the app did not sign is
  served as a client without views. With `modern: true` a modern request carries the capability in `_meta`. A client
  that declares nothing is issued no session, exactly as before.
- **A read-only deployment keeps its apps.** With `readOnly` / `AKAN_MCP_READONLY` the app tools, their resources and
  views stay, since a load may only query, and the result says so in `_meta`; the view refuses a write before it
  reaches the host with `base.error.readOnlyDeployment`, toasted in the person's language. A `.prompt()` page's text
  tool is dropped, since its run renders the whole page; the prompt stays.
- **`.prompt()` is a briefing, never a view.** Its page is also a text tool of the same name, marked
  `readOnlyHint: false`, since running the page makes its own `fetch.*` calls; like any render it refuses a mutation
  with `base.error.mutationInRender` unless the call passes `{ duringRender: true }`. To have a host draw part of that
  screen, declare an `.app()` beside it.
- **The view has no network.** `connect-src` stays closed; the app's own origin is opened for what a page loads by
  URL — fonts (served with `Access-Control-Allow-Origin: *`) and stored images — and every root-relative URL the
  page writes is pointed at it, since a host may block the document's `<base>` (Claude does).
  Cookies and Web Storage are in-memory, and the websocket, live sync, pubsub, the reconnect overlay and
  `<Agent.Chat />` are off.
- **The view looks like the host.** Its neutrals (`--background`, `--foreground`, `--muted`, `--border`, `--ring`) and
  `--font-sans` / `--font-mono` follow the host's theme variables, its theme follows the host's, and so does its
  language when the app speaks it; the app's brand colors and radii stay its own.
- **The host's model drives the component too.** The view offers the host the tools the element publishes — the
  surface `<Agent.Chat />` reads: `st.tool`, the form setters, `fill<Model>Form`, `readScreen` / `readState` /
  `highlight` — and, to a host that takes it, the view's context (route, live state, `<Agent.Guide>`) through
  `ui/update-model-context` whenever it moves. A tool that declares `confirm` asks the person in the view through
  the `AgentApproval` slot, whatever the host asks on its own; a card tool, which a person answers in a chat, is not
  offered.
- **A person tapping in the view acts with the agent's token**, so `isAgentCall` is true and a `Person` act is
  refused there. That act belongs on the web page the result links to. The view holds no token: it is handed the
  caller's claims, and each call it makes is relayed and judged by the guards.
- **A view's call answers what a browser would get**, in `_meta` beside the masked result: the value with its
  `visual` fields, or the domain `Err` with its key and data, toasted in the user's language. A refusal and a crash
  stay generalized. A load that throws, or a read that fails while the element draws, shows what the call would have
  answered: `No screen exists for these arguments.` for a 404 (a record removed since the call), `This screen is not
  available to the signed-in account.` for a 401 or 403, and `The page failed to load.` for anything else; a download
  (`<a download>`, a data table's export) goes to a host that saves files.
- `option.setMcp({ apps: false })` / `AKAN_MCP_APPS=false` publishes no page tools: no app is published and every
  prompt stays a prompt only. `web: { csr: false }` publishes the app tools with no view, and an API-only build
  (`web: false`) has no pages to publish.

## Progress Reporting
**`McpProgress.report(n, { total, message })`** reports progress from anywhere inside a call, a service or adapter
frames down included, and is a no-op when nobody is streaming — so the same code runs unchanged over HTTP, a
websocket, and in tests. `McpProgress.streaming` says whether anyone is reading, for a report whose message
costs something to assemble.

## Calling The Catalogue In-Process — `AgentToolsRole`

A server-side agent loop or a queue job reaches the same catalogue with no token and no loopback request:
`plug(AgentToolsRole)` in a service, then `listAs(account, { allow })` for the tools a model is offered and
`callAs(account, { id, name, args })` to run one. It adds every `mcp: "agent"` entry, and everything above still
holds — `mcp: false`, the exclusions, `readOnly`, `Person`, the account guards, masking and the refusal text — and
the call's `origin` is `"mcp"`, so `isAgentCall` and `.with(AgentCall)` treat it as an agent's. `allow` only
narrows. It is built from the DI registry, so a batch server, which mounts no `/mcp`, has it too; the per-caller
`/mcp` budget does not apply, an endpoint's own `rateLimit` does. A tool's failure never throws: it comes back as
the result's `error` and `code`. An adaptor may plug the role too. Neither method works before the server has built
its endpoints, so a call from an `onInit` throws `InjectError` `notInitialized`; call from a request, a job or a
schedule. A page's `page().app()` tools are left out: `/mcp` `tools/list` shows them, `listAs` does not, and `callAs` answers `Unknown tool`.

- **The account is trusted as given.** It is put on the call after the middleware chain, so pass one the server
  resolved, never client input, and resolve a stored one again before reusing it: a revoked session is not noticed.
  Its `machine` field is removed, since only a verified machine token may set one.
- **`headers` are forwarded without `authorization`, `cookie` and `origin`**; `ip` is what `getClientIp()` and an
  ip-scoped `rateLimit` read, unknown by default.
