# MCP Server

- Source: /cheatsheet/interface/mcp
- Mirror: /llms/pages/cheatsheet/interface/mcp.md
- Section: cheatsheet
- Category: Interface
- Priority: P2

## Headings

- MCP Server (#overview)
- 1. Turn The Server On (#enable)
- 2. Write An Endpoint (#tool)
- 3. Slices And CRUD (#slice)
- 4. Publish A Screen As A Prompt (#prompt)
- When A Prompt Cannot Run (#prompt-failures)
- 5. Report Progress (#progress)
- Authorization (#auth)
- Tips (#tips)

## Content

MCP Server

Every signal you already wrote is served to AI agents at `POST /mcp`. There is no second API and nothing to add to a signal file: the same endpoint runs through the same guards, middleware and service. The chat inside your own pages is a different surface, the In-Page Agent.

Words used on this page

Term

- MCP: Model Context Protocol: the standard AI clients like Claude Code and Cursor use to call a server.

- tool: A function the model may call; each published endpoint becomes one, named by its key.

- resource: A read addressed by an `akan://` URI, which a client can attach as context.

- prompt: A screen published for the user to run as a slash command in the MCP client.

- catalogue: The list of tools, resources and prompts a client downloads when it connects.

What becomes what

What you wrote

tool

resource

prompt

- Signal (*.signal.ts)

  - query · mutation: Custom endpoints and the generated create, update and remove become tools named by their key.

  - <model> · <model>List…: Generated reads are tools that also get an `akan://` resource URI.

  - <model>Insight…: An aggregate with nothing to point at, so it stays a tool with no URI.

  - pubsub · message: Never exposed: their arguments read a socket an MCP request does not have.

- Page (page/**)

  - page().prompt(): A screen the user runs as a slash command; the model does not pick it.

Published as

Not published as

When an endpoint is refused

Exposure follows the guards, and there is no per-endpoint opt-in. An endpoint is published unless one of these applies, checked top to bottom:

Refused when

Why, and what to do

- It declares `mcp: false` — It was curated off the shelf on purpose; its guards and HTTP stay exactly as they were.

- A guard declares `static agents = false`, like `Person` — It is an act reserved for a person, so no model is ever offered it.

- It declares no `guards`, or an empty list — Nobody decided who may call it; write `guards: [Public]` if anonymous access is the intent.

- It is the generated `light<Model>` read — It reads the same document as `<model>` in a smaller shape, so the agent calls `<model>` instead.

- It is a `pubsub` or a `message` — It rides the websocket, and its arguments read a socket an MCP request does not have.

- The deployment is read-only and it is not a `query` — The `readOnly` valve drops every mutation, whatever its guards allow.

- It returns `Any`, `Upload` or `Binary` — A model cannot be told what comes back, and raw bytes only fill its context window.

- It takes a file upload — A file upload has no MCP representation.

- It is a `mutation` whose only guard is `Public` — `[Public]` on a write is having no guard, spelled out; add a real one.

- A required argument is typed `Any` — `Any` is left out of the schema, so expose a named filter slice instead.

**A refused tool looks exactly like a missing one.** Both answer `Unknown tool`, and a guard's refusal always reads `You are not permitted to perform this action.` without naming the guard. Never make either message more helpful: the difference would let a caller enumerate your private surface.

1. Turn The Server On

`/mcp` is mounted by default, so a new app already serves it. Change its settings in `lib/option.ts` with `setMcp()`, not in `main.ts`:

**Mount order.** Every lib's `option.ts` is read in mount order and the app's last, so the app has the final word.

**Code beats env, except the off switch.** A value written in code wins over the `AKAN_MCP_*` env of the same name, but writing `undefined` does not erase the env's value. `AKAN_MCP=false` keeps `/mcp` off whatever the code says.

**Turning it off.** Write `setMcp(false)` in code, or set `AKAN_MCP=false` in the env.

**Function form.** `setMcp((options) => ({ … }))` receives the server options from `env.server.*`, for a value decided at boot. `libs/shared` builds its `auth` this way.

Options

- enabled (boolean, default true, AKAN_MCP, AKAN_PUBLIC_MCP): Whether `/mcp` is mounted; `false` or `0` in the env turns it off whatever the code says.

- readOnly (boolean, default false, AKAN_MCP_READONLY, AKAN_PUBLIC_MCP_READONLY): Publishes queries only, whatever the guards allow; the env turns it on only on `true` or `1`.

- path (string, default /mcp, AKAN_MCP_PATH): Mount path; the OAuth resource identifier, and so the `aud` a token needs, follows it.

- version (string, default 0.0.0, AKAN_MCP_VERSION): Reported as `serverInfo.version`, the same placeholder the OpenAPI document uses.

- instructions (string, default Domain tools for the <app> app., AKAN_MCP_INSTRUCTIONS): Sent to the model with the tool list: what the app is for and which tool to reach first.

- allowedOrigins (string[], default [], AKAN_MCP_ALLOWED_ORIGINS): Extra origins past the DNS-rebinding check; only a browser-hosted client sends an Origin.

- pageSize (number, default 100, AKAN_MCP_PAGE_SIZE): Entries per catalogue page; a client follows `nextCursor` for the rest.

- language (string, default en, AKAN_MCP_LANGUAGE): The one language of the catalogue and its error text, server-wide.

- outputSchema ("full" | "shallow" | "none", default shallow, AKAN_MCP_OUTPUT_SCHEMA): Result shape a tool advertises: `shallow` names nested models, `full` inlines, `none` omits.

- legacyTextBlock (boolean, default true, AKAN_MCP_LEGACY_TEXT): Repeats a structured result as JSON in the text block; the env can only turn it off.

- rateLimit ({ calls?, windowMs?, concurrent? } | false, default 120 calls / 60s, 8 in flight, AKAN_MCP_RATE_LIMIT, AKAN_MCP_CONCURRENT): Per-caller budget for `tools/call`, `resources/read` and `prompts/get`, counted per process.

- promptBudget (number, default 60000, AKAN_MCP_PROMPT_BUDGET): Characters of screen data one page prompt may attach before its lists are cut.

- auth ({ authorizationServers?, scopes?, resource?, verify? }, default {}, AKAN_MCP_AUTH_SERVERS, AKAN_MCP_SCOPES, AKAN_MCP_RESOURCE): The OAuth resource-server identity; naming an authorization server makes a token mandatory.

**Over the rate limit** a call answers `429` with `Retry-After`. Listings are not counted, and N replicas grant N budgets.

**`outputSchema: "none"` keeps the text block** whatever `legacyTextBlock` says: a client reads `structuredContent` only against a declared schema.

2. Write An Endpoint

Name the guards and you are done. A custom `query` or `mutation` with a real guard is published as a tool:

Tool part

- name: The endpoint key as written, such as `startTask`.

- inputSchema: Every `.param()`, `.search()` and `.body()` argument in one object; `.search()` ones are optional.

- outputSchema: The return model; a scalar or a nullable single return ships as text only.

- title, description: The endpoint's dictionary label and its `.desc()`.

- annotations: `readOnlyHint` on a query, `destructiveHint` on a `remove…` or `delete…` mutation.

Write the dictionary entry in the same change:

**An agent picks a tool by its description,** so a tool without `.desc()` is a broken tool, not an untidy one.

**Describe every argument** in `.arg()`: each description rides in the input schema.

3. Slices And CRUD

The generated reads and CRUD publish through the `slice()` guards map. A named slice does not inherit that map: write its own guards, or it is not published.

Generated entry

- taskList, taskInsight: The root slice: guarded by `guards.root`, opted out with `mcp: { root: false }`.

- task: The full read: `guards.get` and `mcp: { get: false }`; `lightTask` is never published.

- createTask, updateTask, removeTask: `guards.cru` and `mcp: { cru: false }`, or a per-verb key such as `create`.

- taskListInTodo, taskInsightInTodo: A named slice: only its own `init({ guards, mcp })` counts.

To keep an entry off the shelf, use `mcp: false`. On `slice()` it is a map keyed like `guards`:

**`mcp: false` is curation, not authorization.** It takes an entry off the shelf; its guards and HTTP stay the same.

**The `slice()` map mirrors `guards` key for key** (`root`, `get`, `cru`, `create`, `update`, `remove`) and reaches exactly as far: the root slice and generated CRUD.

**A bare `mcp: false` turns them all off.** It expands to `root`, `get` and `cru`, and `create`, `update` and `remove` inherit `cru`.

**A named slice or a custom endpoint writes a plain boolean** in its own option, never the map.

Resource URIs

Every published generated read also gets a URI a client can read directly:

Generated resource URIs

**Only `<model>` and the `<model>List…` reads have one.** An insight is an aggregate with nothing to point at, and a custom endpoint keeps its tool but gets no template.

**The root list is the bare `…/list`.** The third segment belongs to the slice key, so the root list has none.

**`lightTask` gets neither** a tool nor a URI.

**The root list filters by name only.** `queryKey` takes one of the model's filter names, but `args` is typed `Any`, so it is left out of the schema and a value sent for it is refused. Declare a named filter slice when an agent should pass a filter's arguments.

4. Publish A Screen As A Prompt

A prompt is a screen, not an endpoint. Declare it on the page with `.prompt(name, description)`: the user runs it as a slash command, and the model receives what the page loads:

**The description is the whole instruction.** Write it in English, in API vocabulary; `<Agent.Guide>` text never reaches MCP.

**Arguments come from the page's declaration.** `.param()` is required, `.search()` is optional, and `desc` becomes the argument's description.

**A list argument is typed comma-separated.** Its description gets `Comma-separated list.` appended, and an ID, Int or enum value is checked by the page's own declaration.

**Names are unique.** A name matches `^[A-Za-z0-9_-]{1,64}$` and is unique across pages; `prompts/list` lists every page with `.prompt()`.

**Only pages declare prompts.** A signal has no `prompt()` builder, and `Msg` is not a public API.

What prompts/get sends back

`prompts/get` runs the page body (root layouts, layouts, then `render`) in the RSC worker under the caller's bearer token. Nothing is rendered and no client component runs; each `fetch.*` query the page makes becomes part of the answer:

Part

- user: The page's description, as the first user message.

- resource: One per query, masked by its endpoint's return model: no hidden, secret or visual fields.

- uri: The `akan://` URI the tool answers to; a custom read gets `akan://<toolKey>?args`.

- Tools for this screen: …: The fetched modules' published tools that the caller may see, minus the attached reads.

One document read in two shapes, such as a layout's `project` and a page's `lightProject`, is attached once, as the larger.

When A Prompt Cannot Run

A prompt cannot re-run itself and has no fallback context, so every way a screen can decline comes back as a message the caller can act on. Each of these answers instead of the page's data:

What happened

- A required argument was left out: The page is not run; the answer names the tool that finds the id.

- An argument fails the page's declaration: The page is not run; the declaration's own error message is returned.

- A redirect or a guard refusal, with no token: A `401` credential challenge, so the client signs in instead of giving up.

- A redirect or a guard refusal, with a token: One fixed answer, so it never confirms whether an id exists. — Example: `This screen is not available to the signed-in account.`

- `router.notFound()`, or a document it reads is missing: Answered as not-found for these arguments. — Example: `No screen exists for these arguments.`

- Any other throw: The real error is logged on the server and never described to the caller. — Example: `The page failed to load.`

**Lists are cut to `promptBudget`** (60,000 characters by default), largest first, with a note: `Attached the first N of M rows of <key>; call it for the rest.` A single document is never cut.

**Tool exposure is unchanged.** Guards decide, and `mcp: false` and `Person` still apply.

**The in-page chat lists no app prompts.** It keeps only its six built-in slash commands.

**An API-only build has no prompts,** because the RSC worker answers them and `web: false` runs none.

5. Report Progress

A long tool call can stream progress to the client. Report from wherever the work happens: outside a streamed call `report` does nothing, so the same service runs unchanged over HTTP, a websocket and in tests:

**The client asks for it** with both `Accept: text/event-stream` and a `_meta.progressToken`. Only `tools/call` streams.

**The stream opens at the first report.** A call that never reports answers as plain JSON.

**Cancelling is the client closing the stream.** Later reports are dropped, but the framework cannot stop an `exec` already running; it finishes with nobody waiting.

**`McpProgress.streaming`** is `true` while a caller is reading, so build an expensive message only then.

Authorization

MCP arrives over HTTP and runs the ordinary pipeline, so guards, `Self` and the account middleware behave as they do for a browser. One difference: the cookie header is dropped at the door, so the `Authorization` header is the only credential.

What a caller is shown

Every guard declares `static scope`, with no default. It decides whether the guard can hide an entry from a caller's listing:

Guard

Hides from listing

Checked at call

- scope: "account"

  - SignedIn · Admin · Every: Reads only the caller, so an anonymous agent is not offered admin tools it can only fail.

- scope: "resource"

  - Can<Verb><Model> · SelfOrAdmin: Needs the call's arguments, so the entry stays listed and is stopped at call time.

Yes

No

The listing is only a convenience filter; the call still runs every guard.

Where tokens come from

- Your app mounts libs/shared — Nothing to set. The app serves the OAuth 2.1 server itself (metadata, consent, registration, token, revocation) and names itself the issuer. — /.well-known/oauth-authorization-server

- Somebody else's issuer — Point `/mcp` at it with the three env vars below. Naming an issuer is what makes `/mcp` demand a token. — AKAN_MCP_AUTH_SERVERS

For somebody else's issuer, set these in the deployment env:

OAuth resource server, by env

**No credential.** Once an issuer is named, a request with no bearer gets a `401` with `WWW-Authenticate`; before that, only a call a guard refuses does. Either way the client signs in instead of concluding the tool does not exist.

**Scopes are for somebody else's issuer.** `insufficient_scope` is enforced only once `AKAN_MCP_SCOPES` is set. Tokens an app mounting `libs/shared` issues itself carry no scope claim, so setting it there refuses every one of them with `403`.

**Audience.** A token with no `aud` is refused once an issuer is named and accepted while none is. An `aud` naming another resource is always refused.

**Signature.** The env vars cannot check a token's signature. Pass `auth.verify` through `setMcp()` so a forged token is refused instead of read as an anonymous caller; `libs/shared` does this for its own tokens.

How an agent obtains a token from an app mounting `libs/shared`, step by step: OAuth For Agents.

Tips

**A tool is missing? The boot log is the only place the answer is,** since there is no opt-in you could have forgotten. `MCP catalogue: tools=…` is followed by one line per refused endpoint with its reason, and both sit below the default level, so set `AKAN_PUBLIC_LOG_LEVEL=verbose`.

**Write the model's `.desc()`** in its dictionary `.of()`. Generated CRUD tools append it to "Get X", and the root list and insight use the `.of()` label and description; those entries have no other text.

**Narrow by cost.** MCP forbids a `$ref` across entries, so every entry inlines the schema of every model it mentions, and the whole listing is re-sent to every agent that connects. The per-signal `MCP catalogue cost:` line says where the bytes went; `mcp: { cru: false }` is the usual lever.

**Caller mistakes read as caller mistakes.** An undeclared argument answers `Unknown argument "x".` and a missing document `No <model> found for the arguments given.` Only a genuine failure says the server failed.

**Bulky fields take `field.visual`.** It is stripped from every MCP result and from the readable schema, so the two agree.

- OAuth For Agents — Where an agent's token comes from, and how to revoke it.

- In-Page Agent — The chat inside your own pages, a different surface from MCP.

## Code Examples

### apps/myapp/lib/option.ts

```ts
export const option = new AkanOption<ModulesOptions>().setMcp({
  instructions: "Task tracking for one team. Start from taskListInTodo.",
  language: "en",
  outputSchema: "shallow",
});

// A value decided at boot takes a function of the env.server.* options:
//   .setMcp(() => ({ readOnly: getEnv().environment === "debug" }))
```

### rateLimit

```ts
AKAN_MCP_RATE_LIMIT=60/30   # 60 calls per 30s; off disables
AKAN_MCP_CONCURRENT=4
```

### apps/myapp/lib/task/task.signal.ts

```ts
export class TaskEndpoint extends endpoint(srv.task, ({ query, mutation }) => ({
  taskSummary: query(cnst.TaskInsight, { guards: [SignedIn] })
    .search("status", cnst.TaskStatus)
    .exec(async function (status) {
      return await this.taskService.insightByStatuses([status ?? "todo"]);
    }),
  startTask: mutation(cnst.Task, { guards: [CanWriteTask] })
    .param("taskId", ID)
    .exec(async function (taskId) {
      return await this.taskService.startTask(taskId);
    }),
})) {}
```

### apps/myapp/lib/task/task.dictionary.ts

```ts
.endpoint<TaskEndpoint>((fn) => ({
  startTask: fn(["Start Task", "작업 시작"])
    .desc(["Moves one task from todo to in progress", "할 일 하나를 진행중으로 옮깁니다"])
    .arg((t) => ({
      taskId: t(["Task ID", "할 일 ID"]).desc(["The task to start", "시작할 할 일"]),
    })),
}))
```

### apps/myapp/lib/task/task.signal.ts

```ts
export class TaskSlice extends slice(
  srv.task,
  {
    guards: { root: Admin, get: SignedIn, cru: SignedIn },
    mcp: { cru: false }, // [!code highlight]
  },
  (init) => ({
    inTodo: init({ guards: [SignedIn] }).exec(function () {
      return this.taskService.queryByStatuses(["todo"]);
    }),
  }),
) {}

// A named slice and a custom endpoint carry a plain boolean, never the map:
//   inArchive: init({ guards: [SignedIn], mcp: false })
//   requestPhoneCode: mutation(Boolean, { guards: [SignedIn], mcp: false })
```

### Code

```markdown
akan://task/{taskId}
akan://task/list{?queryKey,skip,limit,sort}
akan://task/list/inTodo{?skip,limit,sort}
```

### apps/myapp/page/project/[projectId]/tickets.tsx

```ts
export default page()
  .param("projectId", ID, { desc: "The project to brief." })
  .search("statuses", [String], { desc: "Statuses to include." })
  .prompt("briefProjectTickets", "Brief the ticket board of one project.")
  .render(async ({ projectId, statuses }) => {
    const [{ project }, { ticketInitInProject }] = await Promise.all([
      fetch.viewProject(projectId),
      fetch.initTicketInProject(projectId, statuses),
    ]);
    return (
      <>
        <Project.View.General project={project} />
        <Ticket.Zone.Card init={ticketInitInProject} projectId={projectId} />
      </>
    );
  });
```

### A required argument was left out

```ts
No <arg> was named for "<prompt>".
Find it with <model>List…, then run this prompt again with <arg>=<id>.
```

### apps/myapp/lib/task/task.service.ts

```ts
import { McpProgress } from "akanjs/signal";

export class TaskService extends serve(db.task, () => ({})) {
  async importTasks(rows: cnst.TaskInput[]) {
    for (const [idx, row] of rows.entries()) {
      McpProgress.report(idx + 1, {
        total: rows.length,
        message: `importing ${row.title}`,
      });
      await this.createTask(row);
    }
    return rows.length;
  }
}
```

### Code

```bash
AKAN_MCP_AUTH_SERVERS=https://auth.example.com
AKAN_MCP_SCOPES=akan.read,akan.write
AKAN_MCP_RESOURCE=https://api.example.com/mcp
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

