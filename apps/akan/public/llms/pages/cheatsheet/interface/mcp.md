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
- 4. Write A Prompt (#prompt)
- 5. Report Progress (#progress)
- Authorization (#auth)
- Tips (#tips)

## Content

MCP Server

Every signal you already wrote is served to AI agents at POST /mcp. There is no second API and nothing to write in a signal file: the same endpoint runs through the same guards, middleware, and service. The in-page chat is a different surface.

In-Page Agent

Become tools. A generated read also gets a resource URI.

A slash command the user invokes, not the model.

Never exposed — their arguments read a socket MCP does not have.

Exposure follows the guards. A real guard publishes; no guards at all is refused; a mutation whose only guard is [Public] is refused. A Public read publishes. A refused endpoint answers the same unknown tool as one that does not exist.

1. Turn The Server On

/mcp is mounted by default. Configure it in lib/option.ts — not main.ts — so the process that mounts the route actually receives the settings. Every lib's option is read in mount order with the app's last. A value written in code wins over the env of the same name.

What this app is for and which tool to reach for first. Handed to the model with the tool list.

Drops every mutation whatever it declared. A deployment valve, not the exposure switch.

Mount path defaults to /mcp. Catalogue language is en, built once at boot. pageSize is entries per listing page.

Only a browser-hosted client sends Origin. Native clients do not need this.

Takes the whole surface off. AKAN_PUBLIC_MCP is the same pairing OpenAPI already has.

2. Write An Endpoint

Name the guards and you are done. The tool name is the endpoint key, the input schema comes from the declared arguments, and the output schema from the return model.

Write the dictionary entry at the same time. An agent picks a tool by its description, so a missing one is a broken tool — the boot log names every published entry that has none.

3. Slices And CRUD

Generated CRUD publishes from the slice() guards map — get, cru, and the per-verb entries. A named slice does not inherit that map: write its own guards, or it is refused and named in the boot log.

Every generated read also gets a resource URI. An insight does not — it is an aggregate with nothing to point at. A custom endpoint keeps its tool and gets no template. The root list is the bare .../list, with no third segment, because that segment is the slice key.

generated resource uris

The root list's raw query argument is typed Any, so it is left out of the schema. Declare a named filter slice when an agent should narrow a list.

4. Write A Prompt

A prompt is invoked by the user — a client renders it as a slash command. exec returns PromptMessage[], or a bare string that is wrapped into one user message. It takes .param() and .search() only: prompts/get sends a flat string map.

Msg.user and Msg.assistant carry text. Msg.link points without embedding. Msg.resource embeds a value. Msg.image / Msg.imageOf / Msg.audio inline bytes.

Name the model on an embedded value so hidden and secret fields are stripped: Msg.resource(uri, task, { model: cnst.LightTask }), or Msg.mask for one piece of an assembly. An undeclared value whose secret fields are populated is refused.

Give the instruction a high priority (0..1) and attachments a low one — a client with a full window otherwise drops blocks by position.

A prompt is also a plain HTTP GET whether or not MCP is on, so a web UI can preview it. Guard it like any other read.

5. Report Progress

Report from wherever the work happens. Outside a streamed call it is a no-op, so the same service runs unchanged over HTTP, a websocket, and in tests.

The client must send both Accept: text/event-stream and a progressToken. The server switches only after the first report.

Cancellation is the client closing the stream. Watch McpProgress.signal; the framework cannot stop an exec already in flight.

McpProgress.streaming is true while anyone is reading, so an expensive message can be skipped.

Authorization

MCP arrives over HTTP and runs the ordinary pipeline, so guards, Self, and account middleware behave as they do for a browser call.

The verdict reads the caller only. Evaluated when filtering a listing, so an anonymous agent is not offered admin tools it can only fail at.

Needs the call's arguments, so it is never evaluated for a listing. The entry stays visible and is stopped at call time.

Every guard must declare static scope with no default. SignedIn / Admin are account; every Can<Verb><Model> is resource. The listing is a UX filter — the call still runs every guard.

OAuth resource server, by env

Unauthenticated calls get a WWW-Authenticate challenge, so a client authenticates instead of concluding the tool does not exist.

insufficient_scope is enforced only once AKAN_MCP_SCOPES is set. First-party Akan tokens carry no scope claim.

A token with no aud is refused once AKAN_MCP_AUTH_SERVERS names an issuer, and accepted while none is named.

Tips

A missing tool is explained in the boot log: MCP catalogue: tools=… then one verbose line per refusal. Turn verbose on, because there is no opt-in to notice — that log is the only place the answer exists.

Write the model's .desc(). Generated CRUD tools append it to Get X, and the root list borrows the .of() label — those entries have no other text.

An Any or Upload return is refused. A required Any argument is refused too — leave optional Any out of the schema, and send nothing under that name.

A prompt also refuses a list argument and any Any argument: its arguments are one string per name, with no schema beside them.

An unknown argument is reported as the caller's mistake. A missing document is too. Only a genuine failure answers that the server failed.

A guard's refusal reads You are not permitted to perform this action. — never the guard's name.

## Code Examples

### lib/option.ts

```ts
export const option = new AkanOption<ModulesOptions>().setMcp({
  instructions: "Domain tools for the akan app. Start from taskListInTodo.",
  language: "en",
});
```

### task.signal.ts

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

### task.dictionary.ts

```ts
.endpoint<TaskEndpoint>((fn) => ({
  startTask: fn(["Start Task", "작업 시작"])
    .desc(["Moves one task from todo to in progress", "할 일 하나를 진행중으로 옮깁니다"])
    .arg((t) => ({ taskId: t(["Task ID", "할 일 ID"]).desc(["The task to start", "시작할 할 일"]) })),
}))
```

### task.signal.ts

```ts
export class TaskSlice extends slice(
  srv.task,
  { guards: { root: Admin, get: SignedIn, cru: SignedIn } },
  (init) => ({
    inTodo: init({ guards: [SignedIn] }).exec(function () {
      return this.taskService.queryByStatuses(["todo"]);
    }),
  }),
) {}
```

### Code

```ts
akan://task/{taskId}
akan://task/light/{taskId}
akan://task/list{?skip,limit,sort}
akan://task/list/inTodo{?skip,limit,sort}
```

### task.signal.ts

```ts
reviewTask: prompt({ guards: [SignedIn] })
  .param("taskId", ID)
  .search("tone", String)
  .exec(async function (taskId, tone) {
    const task = await this.taskService.getLightTask(taskId);
    return [
      Msg.user(`Review this task in a ${tone ?? "neutral"} tone and suggest next steps.`),
      Msg.resource(`akan://task/${taskId}`, task, { model: cnst.LightTask }),
    ];
  }),
```

### task.service.ts

```ts
async importTasks(rows: cnst.TaskInput[]) {
  for (const [idx, row] of rows.entries()) {
    McpProgress.report(idx + 1, { total: rows.length, message: `importing ${row.title}` });
    await this.createTask(row);
  }
  return rows.length;
}
```

### Code

```ts
AKAN_MCP_AUTH_SERVERS=https://auth.example.com
AKAN_MCP_SCOPES=akan.read,akan.write
AKAN_MCP_RESOURCE=https://api.example.com/mcp
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

