<!-- akan:generated -->

## A Server Agent Loop — `agentService.loop`

`this.agentService.loop(request)` runs a model over that catalogue until it answers, with no browser — a queued
task, a scheduled run, a reply to a mention. It is an async iterable of `text`, `toolCall`, `toolResult`, `usage`,
`compacted` and `awaiting` events that ends in exactly one `done { stop }` or `error`, and it waits for the consumer
at every event.

- **Who it acts as.** `account` is a snapshot the server resolved; `principal` is a stored id that
  `option.setAgentAccountResolver((principal) => account | null)` resolves at the start and before every round, so
  a revoked one ends the run as `"unauthorized"`, as does a missing or falsy `account`: there is no anonymous run.
  Neither is ever client input. The model is offered `allow` ∩ what
  the account sees on `/mcp`, and a call to a name that round did not list is answered as an unknown tool, neither
  asked about nor run. A request with no `allow` array is an `error`.
- **Toolkits.** `toolkits: { calendar: { description, tools } }` groups names of `allow` so a round need not carry
  every tool. A tool in no toolkit is listed every round, beside one more, `openToolkit({ name })`, whose description
  lists the toolkits. An opened toolkit's tools are listed from the next round on; `openToolkit` never reaches
  `approve` and counts as no tool call. A resume reopens what stored calls and a summary's `toolkits` opened.
- **The open screen's tools.** `clientTools` takes `new AgentClientTools().list()` from a page the member has open
  (`akanjs/ui`), sent over your own transport. It is client input: a name an endpoint holds is dropped, every one
  counts as a write whatever `readOnly` it was sent with, and past 128 tools, 200,000 characters of definitions or
  64 levels of nesting the run ends with `agent.error.clientToolsRefused` (413, `data.limit` `"tools"`, `"chars"` or
  `"depth"`). Which of them may run after a read is the app's to say, in `approve`, by name. The run never runs one:
  `approve` is asked, then the run ends `awaiting` with `client: true`. Have the page `run(call)` and resume with
  what it returned as `answer` — or `answer: { id, error }` when no page answers. The page keeps its own rule beside
  the run's: `run(call)` asks the member through `host.approve` when a call that changes something follows a `taint:
  "source"` read. The run's rule below is the wider one, counting every result, the page's included, so with no
  `approve` a client call is refused once the run has read anything; an `approve` that allows a client call leaves
  that question to the page.
- **Asking the member.** `ask: true` lists `askUser({ question, choices?, multiple? })`, the in-page chat's own tool.
  A call ends the run `awaiting` with `question: true`; put the question to the member and resume with
  `answer: { id, result }` — or `{ id, error }` when they dismiss it. It never reaches `approve`, counts as no tool
  call, and `untrusted` never sees the answer. A `clientTools` entry by that name is dropped.
- **Answering a parked call.** `answer` is the only way in for what a client sends, and `messages` holds only your
  own user messages and what `onMessage` handed over: never append a client's result to them. Never take `messages`
  from a request either: store what `onMessage` hands out, and pass from the client only `answer`, as a tool message
  a client wrote reads exactly like one the run stored. Pass `answer` only after an `awaiting` event with `client`
  or `question` named that call. `approve` is not asked about an answered call, as nothing runs on the server, so an
  answer given for a call `approve` deferred, or for one a run died before parking on, is stored as it stands. A run
  parks on one call, the first of its last batch that nothing answered, so `answer` is accepted for that call alone
  and only when it is a client tool's or `askUser`'s. The run names the result after the call, whatever name was
  sent, hands it to `onMessage`, emits it as a `toolResult` and runs the calls the batch has left. Every part of it
  is bounded: `result`, `error` and `changes` as one value are clipped at 20,000 characters like a tool's result,
  `code` is kept only when it is a failure code, and of its `attachments` the first four carrying `data` or `text`
  are kept, never a `url`. An endpoint tool's call is answered only by running it: an `answer` naming one, a call
  the run has not reached, or a call already answered ends the run with `agent.error.answerRefused` before anything
  runs, and a resume without it carries on. Only `askUser`'s answer is the member's own word; a client tool's always
  taints the run, by the rule below. A call parked with `connect` takes one answer only, the user's refusal as
  `{ id, error }`; see "Calling Another Server".
- **Other servers.** `remotes` takes other MCP servers, each a toolkit named after it: none is listed or contacted
  until the model opens it, and its tools then read `<name>.<tool>`. See "Calling Another Server" below.
- **Writes after a read.** What a tool returns may be text someone else wrote, so the run is tainted from the first
  result of a call that ran — an endpoint tool's or a client tool's, an error included — and every later call
  reaches `approve(call, { tainted, tool, client })` with `tainted` set, and `client: true` when the call is to a
  page's tool. `askUser`'s answer, `openToolkit`'s and a call the run refused without running taint nothing. A batch
  is judged before it runs, since the model wrote it before reading its results. Without `approve`, a `needsConfirm`
  tool — on this catalogue, a mutation with the `destructive` hint above — is refused, and so is every write once
  tainted: such a run writes only in the batch written before any result, and a later write is answered with the
  code `writeAfterRead` and a sentence naming the two ways on. Pass `approve` to decide those calls, or pass
  `untrusted(result)` to say which endpoint results carry another party's text: `(result) => !own.has(result.name)`
  trusts the endpoints you name, and `() => false` trusts every endpoint result, which is right only when nothing
  they return was written by anyone but the app and the member. No endpoint option says whose text a tool returns —
  `readOnly` says only that it changes nothing — so the predicate is where that is declared. It is never asked about
  a client tool's answer, which taints the run whatever it is named: a page may lend a tool under the name of an
  endpoint this run does not list, and a predicate reading names would trust it. Only `approve` lets a write follow
  a page's answer. `"defer"` holds the whole batch, emits `awaiting` and ends the run as `"awaiting"`.
- **Resuming.** Store each message `onMessage` hands over — it is awaited, and a retried run may hand one over twice
  — and call `loop` again with them. A stored result is read as the answer to the call its id names, under that
  call's name. It is judged as an endpoint's only when that call names an endpoint this run lists: any other, a
  page's tool or a tool this run no longer has, taints the run without asking `untrusted`, whatever mark it was
  stored with. The run's own answer to a tool name the model made up, `Unknown tool: <name>.` with nothing beside
  it, taints nothing. Keep `ask` and `toolkits` the same for the life of a transcript: a stored `askUser` or
  `openToolkit` answer is the run's own only under the options it was given with, and one whose name the page lends
  taints. Trailing calls nothing answered go to `approve` again before any model call, and the taint is rebuilt from
  the `tainted` marks on stored messages and by re-applying `untrusted`, which sees a result whole during the run
  and clipped on a resume; with no `untrusted` every stored tool result taints, a refusal included, as a resume
  cannot tell one from a result. Store every message whole, marks included. `compacted` says the first `replaced`
  messages are now `summary`; its `tainted` marker stands in for the results it replaced, and a summary with no
  marker counts as tainted. A batch's results reach `onMessage` one tool message a call, as each call finishes, so a
  resume runs only the calls that had not finished, even after a crash mid-batch. It cannot tell a call that was
  running when the run died from one that never started: both go to `approve` again and run again, so a write that
  must not land twice needs an idempotent endpoint or an `approve` that defers it. A stored result of that batch
  which `untrusted` marks taints them too: a resume judges on everything stored, where an uninterrupted run judges a
  batch before any of it runs.
- **Metering.** Each model call, compactions included, is its own turn for the request policy, the quota and the
  usage hook. It gets a fresh `id`, `loop { id, round }`, a copy of the request's `meta` — server-set, so it may key
  billing — empty headers and no ip. The relay's default size caps skip loop rounds, except in a run that lists
  `clientTools`: its turns carry `loop.client` and one past `AgentRelayPolicy.defaultLimits` ends the run with
  `agent.error.requestRefused`. A refused quota ends the run as `"quota"`.
- **Limits.** `maxRounds` (12), `budget { tokens, toolCalls, wallMs }` (`"budget"`), `signal` (`"aborted"`) and a
  provider cut (`"length"`). A limit that is not a valid number is an `error` before any model call. `wallMs` and
  `signal` also end a run waiting on a tool or on `approve`. `callAs` cannot cancel a call, so the run stops waiting
  and answers it with an error saying it may still finish; a resume does not run it again, and the endpoint runs on
  with its outcome unreported. There is no preamble unless `preamble` gives one; with no `instructions` either, a
  short neutral prompt stands in, as each adaptor's own fallback is about a screen. `compact { at, keep }` summarizes
  the head, and a tool result is capped at 20,000 characters as the browser caps it. Its calls carry no ip, so an
  ip-scoped `rateLimit` counts them under one unknown address.
- **A refusal for length.** With `compact` set, a round whose call fails as `agent.error.contextOverflow` compacts
  regardless of `at` and asks once more, as one round; a second refusal, or nothing to cut, ends the run with the
  error. An adaptor with its own size cap throws that error with `{ limit, requested }` in its own unit, bytes
  included, and the run lowers `at` to where that request would have fit.

## Calling Another Server — `remotes`

The other direction: an agent running here calls another server's `/mcp` as the signed-in user. The other server needs
no change; any akan app is one already, and so is any MCP server that speaks OAuth 2.1 with dynamic registration.

```ts
// lib/option.ts — off by default, since it lets a signed-in user make this server call an address they name
export const option = new AkanOption<ModulesOptions>().transformEnv((env) => ({ ...env, remote: { enabled: true } }));

// a service that runs the loop
const remotes = this.remoteService.sources(account, [
  { name: "shop", url: project.serverUrl, description: "Orders and refunds of the shop this project runs." },
]);
for await (const event of this.agentService.loop({ account, allow, messages, remotes, approve, onMessage })) {
  if (event.type === "awaiting" && event.connect) /* tell the page: this run waits for a connection to event.connect */;
}
```

- **A connection is the user's own OAuth grant at the other server.** `libs/shared`'s `remote` service registers this
  app there once, sends the user to that server's consent page, and keeps the tokens sealed on the server. The other
  server judges every call by its own guards, as it judges any agent's, so `Person` endpoints stay closed. Accounts
  are never matched across servers.
- **Connecting happens in the chat.** Opening a remote the account has no connection to ends the run `awaiting` with
  `connect: "<name>"` and leaves the call unanswered. Render `<Remote.Util.Connect url={…} onConnected={resume} />`:
  it opens the other server's sign-in in a window and calls back once `page/remote/callback` finished the exchange.
  Resume with the stored messages and no `answer`, and the run opens the toolkit itself. When the user declines,
  resume with `answer: { id, error }` for that call: the run stores your sentence as the open's result and goes on.
  It is the user's own word, so it taints nothing. An `answer` carrying a `result` for an open is refused with
  `agent.error.answerRefused`, as only the server sees whether a connection exists.
- **What a remote lists and returns is another party's text.** Opening a remote taints the run, whatever `untrusted`
  says: its tools' names, descriptions and schemas reach the model with the open, and so does the error of an open
  that failed. An open that only asks the user to connect taints nothing. A call's arguments leave for that server,
  and `readOnly` is the remote's own word for its tool, so a request with `remotes` and no `approve` is refused
  before any model call, as `base.error.requiredArgument` naming `approve`: pass one with `remotes`. It is told the
  target as `state.remote`, and hears a tool the remote does not call read-only as a `needsConfirm` one. Show the
  user that server's name and the arguments before allowing a write: a record on one server can ask the model to
  write to another.
- **Names.** A remote's `name` is `[a-z][A-Za-z0-9]{0,15}` and may not be a toolkit's. A tool name too long or with
  characters a provider refuses is listed under a shortened alias and still called by its real name. A run takes
  at most 120 tools from one remote, a description to 1,000 characters and a parameter schema to 8,000, and stops
  listing at 120,000 characters in all; the open's result counts the tools left out as `omitted`. Pass `allow` in
  the remote's entry to choose which tools those are.
- **Addresses.** `url` is the server's address or its MCP endpoint; a bare origin means `/mcp`. Every request goes
  through `RemoteFetch`: https only, no private address, no redirect, the checked address pinned. A local run
  (`operationMode: "local"`) reaches loopback over http, so two dev servers can connect; `remote.allowUrl` narrows
  the addresses an app accepts.
- **A screen in the result.** When the called tool is a `page().app()`, the `toolResult` event carries `view`
  (`{ remote, tool, args, href?, static?, resourceUri? }`) beside the result. It never reaches the model or
  `onMessage`; store it yourself and draw `<Remote.Zone.Screen url tool={view.tool} args={view.args} href={view.href}
  drawn={view.static} />`. For an app the other server declared `{ static: true }` the card asks `remoteScreen` for
  that server's script-less HTML when it scrolls into view and shows it in a frame that runs no script; for any other
  app, draw `<Remote.Zone.View url tool args uri={view.resourceUri} href />`: it frames that server's view (its
  client bundle) with scripts on but no origin, under a policy that lets it load only from that server and connect
  nowhere, and relays the view's own calls to that one server through `McpAppHost` (`akanjs/webkit`). A view cannot
  write into the model's context, and a link it opens must stay on its server. Neither card stores what it drew: the
  HTML and the view's data are fetched again on every draw, since what the user may see there can change. A view
  weighs over a megabyte, so prefer `{ static: true }` on the other server for anything a person only reads.
- **Not published onward.** The connection endpoints take `Person` and are `mcp: false`, and remote tools exist only
  inside the run: an outside agent connected to this app's `/mcp` never reaches a user's other servers through it.

Without `libs/shared`, build each entry from `RemoteSource` (`akanjs/server`) with your own `access { token, renew }`.

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
