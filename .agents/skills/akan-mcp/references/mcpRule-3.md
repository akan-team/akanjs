<!-- akan:generated -->

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
  default for that reason. An `"account"` guard that throws at listing time reached for arguments it does not
  have: the entry is hidden from every caller and the guard is named once in the log as mismarked.
- **Identity comes from the internal args** (`.with(Self)`, `.with(Account)`, `.with(Me)`), never from an id the
  client sent, and the service re-checks ownership behind the guard.
- **An admin who signs in on the consent page mints an admin token.** A connector created under an admin account
  passes `Admin` guards; treat that as an operational decision, and read the request's subject type when in doubt.
- **Return what answers the question.** A count-or-summary endpoint taking an id beats a document; a nullable model
  return publishes no `outputSchema`, so prefer a non-null return plus an `Err`. Bulky page-only fields are
  `field.visual`. Narrow a list with a named filter slice, never with the root list's raw `query`.

## Writing `instructions`

`*.abstract.md` never reaches an MCP client, and `<Agent.Guide>` only through an MCP App's view, from inside the app's
element, beside the tools it explains. Exactly these texts reach every client: `instructions`, every published entry's
`.desc()`, and a page's `.prompt()` and `.app()` descriptions. All are English, whatever the users speak
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
- **An app is a tool the model picks**, like a read endpoint: its description says what the component shows and for
  which arguments (`Show one ticket with its status and assignee.`), and the model reads the briefing of what its load
  fetched whether or not the host draws the view.

## Verifying An App

- `akan verify <app>`, then the boot log above.
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
