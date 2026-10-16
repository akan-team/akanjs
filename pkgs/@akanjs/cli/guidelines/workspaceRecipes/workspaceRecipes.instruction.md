# Workspace Recipes — Worked Examples And The Auto-Generated API

Step-by-step recipes for the most frequent Akan.js changes, and the reference of what `akan sync` generates for
you at each layer. `workspaceOnboarding` carries the index and the rules; this is the worked code behind them.
Read the whole recipe before editing, and change only the sections it names — do not rewrite a file.

## Workflow Recipes

Concrete step-by-step recipes for the most frequent Akan.js changes. Each recipe shows which files to edit
and in what order. The code examples reference the `task` module in `apps/<app>/lib/task/` as a
template; replace `task` with your model name and `Task` with your PascalCase model name.

When editing a file, always read the existing content first. Only change the relevant sections — do not
rewrite the entire file.

---

### Recipe 1: Adding a New Field to a Model

**Files to edit (in order):** `constant.ts` → `dictionary.ts` → `Template.tsx` → `Unit.tsx` → `akan sync`

```typescript
// 1. apps/<app>/lib/<model>/<model>.constant.ts
// Add field to the Input class. Use field() builder with optional defaults
export class TaskInput extends via((field) => ({
  title: field(String),
  priority: field(TaskPriority, { default: "medium" }),  // NEW FIELD
})) {}

// If the new field should appear in list views, also add it to LightTask:
export class LightTask extends via(TaskObject, ["title", "priority", "status", "due"] as const, () => ({})) {}

// 2. apps/<app>/lib/<model>/<model>.dictionary.ts
// Add i18n labels for the new field (and its enum values if any).
// Labels are [en, ko] pairs, and nearly every one also carries a .desc([en, ko]).
.model<Task>((t) => ({
  priority: t(["Priority", "우선순위"]).desc(["How urgent the task is", "할 일의 긴급도"]),
}))
.enum<TaskPriority>("taskPriority", (t) => ({
  low: t(["Low", "낮음"]),
  medium: t(["Medium", "보통"]),
  high: t(["High", "높음"]),
}))

// 3. apps/<app>/lib/<model>/<Model>.Template.tsx
// Add a form field using st.do.setXxxOnYyy (auto-generated setter)
const form = st.use.taskForm();
<Field.ToggleSelect
  label={l("task.priority")}
  items={cnst.TaskPriority}
  value={form.priority}
  onChange={st.do.setPriorityOnTask}
/>

// 4. apps/<app>/lib/<model>/<Model>.Unit.tsx
// Display the new field in card/list views
<Badge variant={task.priority === "high" ? "error" : task.priority === "medium" ? "warning" : "default"}>
  {task.priority}
</Badge>

// 5. Regenerate barrels
// akan sync <name>
```

---

### Recipe 2: Injecting a Dependency into a Service

Four patterns: injecting an **external adapter** (`use<>()`), another **module's service** (`service<>()`),
a **predefined framework adapter** (`plug()`), or **an adapter you own** (`adapt()` + `plug()`). A field named
`<refName>Service` resolves to the service registered under `<refName>` — the `Service`/`Signal` suffix is required
and stripped to derive the lookup key.

> **For a new adapter you own, prefer the `adapt()` shape in pattern D over the `option.ts` registration in
> pattern A.** An `adapt()` class self-registers and is injected with `plug(TheClass)`, so it never touches
> `option.ts`. Pattern A is the legacy constructor-style shape: recognise it, keep it working, and migrate one
> only when you are already changing it.

> `apps/<app>/lib/option.ts` is a **user-owned** file scaffolded once — edit it to register adapters/DI. Unlike the
> barrels (`cnst.ts`, `db.ts`, `srv.ts`, …) it is **not** overwritten by `akan sync`, so your `.use(...)` registrations
> are safe.

**A. Adapter injection via `use<>()` (for external clients / global singletons)**

```typescript
// 1. Create the adapter class in apps/<app>/srvkit/
// apps/<app>/srvkit/EmailClient.ts
export class EmailClient {
  constructor(readonly apiKey: string) {}
  async send(opts: { to: string; subject: string; body: string }) { /* ... */ }
}

// 2. Register in apps/<app>/lib/option.ts
export const option = new AkanOption()
  .use((options) => ({
    emailClient: new EmailClient(options.mailerApiKey),
  }));

// 3. Inject via use<>() in <model>.service.ts
export class TaskService extends serve(db.task, ({ use }) => ({
  emailClient: use<EmailClient>(),
})) {
  async _postCreate(task: cnst.Task) {
    await this.emailClient.send({ to: "...", subject: "Task Created", body: `Task "${task.title}" created.` });
  }
}
```

**B. Cross-module service injection via `service<>()` (for other Akan services)**

```typescript
// In <model>.service.ts — inject another module's service
import * as srv from "../srv";

export class TaskService extends serve(db.task, ({ service }) => ({
  notiService: service<srv.NotiService>(),
})) {
  async _postCreate(task: cnst.Task) {
    await this.notiService.send("info", `Task "${task.title}" created`);
  }
}
```

**C. Predefined framework adapter injection via `plug()` (storage, cache, queue, schedule, …)**

Akan ships predefined adapter roles from `akanjs/service`: `StorageAdaptorRole`, `CacheAdaptorRole`,
`QueueAdaptorRole`, `ScheduleAdaptorRole`, `DatabaseAdaptorRole`, `WebsocketAdaptorRole`,
`LoggingAdaptorRole`, `CompressAdaptorRole`. `plug()` injects the concrete adapter bound to that role (the
default `StorageAdaptor` binding is `BlobStorage`). `plug()` also accepts a concrete adapter class directly.

```typescript
// In <model>.service.ts — inject the framework storage adapter by role
import { plug, serve, StorageAdaptorRole } from "akanjs/service";

export class TaskService extends serve(db.task, ({ plug }) => ({
  storage: plug(StorageAdaptorRole),
})) {
  async attach(taskId: string, path: string, localPath: string) {
    // BlobStorage returns a URL under blobStorage.urlPrefix (default "/api/localFile/getBlob").
    return await this.storage.uploadDataFromLocal({ path, localPath });
  }
}
```

For a custom adapter class (not a predefined role), pass the class itself, e.g. `ipfsApi: plug(IpfsApi)`.
Injecting a file/image field is usually simpler than calling
storage directly: declare `image: field(File).optional()` (or `images: field([File])`) on the model and let the
store's generated `upload<Field>On<Model>(fileList)` action handle the upload. Add `{ cascade: "removeRef" }` to that
field when the file belongs to the model alone, and removing the model removes the file and its stored object.

**D. An adapter you own — `adapt()` in `srvkit/`**

An injected singleton is an `adapt()` class in `srvkit/`. Write new adapters this way.

```typescript
export class AdminNoti extends adapt("adminNoti" as const, ({ use, env, plug, memory }) => ({
  discordApi: use<DiscordApi>(),
  workspaceRoot: env(() => `~/build/${getEnv().environment}`),
  masterHost: plug(MasterHost),
  tokenMap: memory(Map, { of: String }),
})) {}
```

- Inject it with `plug(TheClass)` from a service or from another adapter. Destructure only the injectors you use,
  and write the registration key `as const`.
- **Do not register an `adapt()` class in `lib/option.ts`.** It self-registers, and `plug(Class)` uses the class
  itself as the token. `option.ts` is now only for legacy constructor-style adapters and for widening the options
  type.
- `this.logger` is provided; never construct a `Logger` inside an `adapt()` class. Lifecycle work goes in
  `override async onInit()`.
- **`adapt()` is for singletons only.** A per-use value object stays a plain class you `new` at the call site. If
  there is not exactly one per process that a service needs injected, it is a plain class.
- **`memory(...)` takes a scalar or model class, not only a primitive** — `memory(Map, { of: CallStateInput })`
  serializes through the constant and travels as JSON text, so the Redis and sqlite-backed caches round-trip the
  same declaration. Never hand-encode JSON into a `String` memory. A memory is scoped to the service or adaptor
  that declares it; `ttl` (milliseconds) sets how long each write lives unless the `set` call names its own
  `expireAt`, and a `Map` entry expires on its own.

Conventions that hold for both adapter shapes (A and D):

- Route every remote call through one private `#api<T>(path, init?)` with `signal: AbortSignal.timeout(20_000)`.
- Paginate with `for (let page = 1; ; page += 1)` broken by `if (pageItems.length < 100) break;`.
- Resolve secrets as `process.env.X ?? options.x ?? deterministicGenerator(...)` **inside a function**, never at
  module scope.
- Extend a function by appending an optional trailing parameter with a default, never by changing arity.
- Parameters: up to three required primitives positional; optional flags in a trailing `{ … } = {}`; four or more
  parameters, or any two same-typed strings, in one named destructured object.
- Release locks in `finally`. Load heavy optional dependencies through a module-level memoized promise
  (`puppeteerLoad ??= import("puppeteer")`).

---

### Recipe 3: Creating and Using a Slice

A Slice is a named, filtered data view. Add file entries and connect from a page.

> **Silent failure — a slice `exec` must return a query descriptor, never an executed list.**
> Return `this.taskService.queryByStatuses(...)` (the `query<Filter>` builder), **not**
> `this.taskService.listByStatuses(...)` / `listBy...(...)` (which returns a `Promise<Doc[]>`).
> Returning an array type-checks but throws at runtime during insight aggregation with the opaque
> `Error: Unknown document field path: 0`. If you see that error, your slice is returning a list, not a query.

```typescript
// 1. apps/<app>/lib/<model>/<model>.signal.ts — Define the slice
export class TaskSlice extends slice(srv.task, { guards: { root: Admin, get: SignedIn, cru: SignedIn } }, (init) => ({
  inTodo: init({ guards: [SignedIn] })
    .search("statuses", [cnst.TaskStatus])
    .exec(function (statuses?) {
      // ✅ query<Filter> — a query descriptor.  ❌ listByStatuses(...) returns an array and fails at runtime.
      return this.taskService.queryByStatuses(statuses ?? ["todo", "inProgress"]);
    }),
})) {}

// 2. apps/<app>/lib/<model>/<model>.document.ts — Add query filter for slice
export class TaskFilter extends from(cnst.Task, (filter) => ({
  query: {
    byStatuses: filter()
      .arg("statuses", [cnst.TaskStatus])
      .query((statuses) => ({ status: { $in: statuses } })),
  },
})) {}

// 3. apps/<app>/lib/<model>/<model>.dictionary.ts — Slice labels
.slice<TaskSlice>((fn) => ({
  inTodo: fn(["Tasks In Todo", "할 일"]).arg((t) => ({
    statuses: t(["Statuses", "상태"]),
  })),
}))

// 4. In page — init the slice inside the page chain's render and hand the init to a Zone.
export default page().render(() => {
  const { taskInitInTodo } = fetch.initTaskInTodo();
  return <Task.Zone.Card init={taskInitInTodo} sliceName="taskInTodo" />;
});
```

The slice name in code uses camelCase (`inTodo`). In dictionary and components it becomes `"taskInTodo"`.

---

### Recipe 4: Creating a Mutation Endpoint (with Status Workflow)

**Files to edit (in order):** `document.ts` → `service.ts` → `signal.ts` → `dictionary.ts` → `store.ts` → `Util.tsx`

```typescript
// 1. <model>.document.ts — Document chain method with state validation
export class TaskDocument extends by(cnst.Task) {
  start() {
    if (this.status !== "todo") throw new Err("task.error.cannotStartFromNonTodo");
    this.status = "inProgress";
    return this;  // Return this for chaining: task.start().save()
  }
}

// 2. <model>.service.ts — Service method wrapping document
async startTask(taskId: string) {
  const task = await this.getTask(taskId);
  return task.start().save();
}

// 3. <model>.signal.ts — Mutation endpoint
export class TaskEndpoint extends endpoint(srv.task, ({ mutation }) => ({
  startTask: mutation(cnst.Task, { guards: [SignedIn] })
    .param("taskId", ID)
    .exec(async function (taskId) {
      return await this.taskService.startTask(taskId);
    }),
})) {}

// 4. <model>.dictionary.ts — Endpoint + error labels
.endpoint<TaskEndpoint>((fn) => ({
  startTask: fn(["Start Task", "작업시작"])
    .arg((t) => ({ taskId: t(["Task ID", "할 일 ID"]) })),
}))
.error({
  cannotStartFromNonTodo: ["Task can only start from todo status", "할 일 상태에서만 시작 가능"],
})

// 5. <model>.store.ts — Client-side action with toast feedback
async startTask(taskId: string) {
  msg.loading("task.startTaskLoading", { key: "startTask" });
  const task = await fetch.startTask(taskId);
  this.setTask(task);  // Auto-generated: updates task state in store
  msg.success("task.startTaskSuccess", { key: "startTask" });
}

// 6. <Model>.Util.tsx — Reusable button component
export const Start = ({ taskId }: { taskId: string }) => (
  <button className={buttonRecipe({ variant: "primary", size: "xs" })} onClick={() => st.do.startTask(taskId)}>
    Start
  </button>
);
```

---

### Recipe 5: Internal Triggers — Interval & Cron

Server-side background jobs. Defined in `internal()` signal, implemented in service.

```typescript
// 1. <model>.signal.ts — Define triggers
export class TaskInternal extends internal(srv.task, ({ interval, cron }) => ({
  cleanupStaleTasks: interval(10000).exec(async function () {
    await this.taskService.cleanupStaleTasks();
  }),

  dailyDigest: cron("0 0 * * *").exec(async function () {
    await this.taskService.sendDailyDigest();
  }),
})) {}

// 2. <model>.service.ts — Implement the logic
async cleanupStaleTasks() {
  const weekAgo = dayjs().subtract(7, "day").toDate();
  const stale = await this.taskModel.listDueBefore(weekAgo);
  for (const task of stale) {
    await task.remove();
  }
}
```

**Available trigger types:**
- `interval(ms)` — runs repeatedly at the given interval
- `cron("min hour dom month dow")` — runs on a schedule
- `initialize()` — runs once on service startup
- `process(Return).msg(Type)` — message queue consumer

A `process` job's `backoff: { type: "exponential", delay, maxDelay }` caps the wait between attempts, and the
internal's `onFailed(job, error)` runs once a job has failed for good — its last attempt, or bullmq's stall limit —
the dead letter, on either queue.

---

### Recipe 6: Creating an Insight (Aggregation / Dashboard Stats)

Insights display aggregated statistics across model data.

```typescript
// 1. <model>.constant.ts — Insight class with accumulate rules
export class TaskInsight extends via(Task, (field) => ({
  totalCount: field(Int, { default: 0, accumulate: {} }),
  completedCount: field(Int, { default: 0, accumulate: { status: "completed" } }),
})) {}

// 2. <model>.dictionary.ts — Insight field labels
.insight<TaskInsight>((t) => ({
  totalCount: t(["Total Tasks", "전체 할 일"]),
  completedCount: t(["Completed", "완료됨"]),
}))

// 3. <Model>.View.tsx — Display component consuming an Insight model
export const Stats = ({ taskInsight }: { taskInsight: cnst.TaskInsight }) => (
  <div className="grid grid-cols-2 gap-4">
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-muted-foreground text-sm">{l("task.totalCount")}</div>
      <div className="font-bold text-2xl text-primary">{taskInsight.totalCount}</div>
    </div>
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-muted-foreground text-sm">{l("task.completedCount")}</div>
      <div className="font-bold text-2xl text-success">{taskInsight.completedCount}</div>
    </div>
  </div>
);

// 4. <Model>.Zone.tsx — Mount in page via Load.Insight bound to a slice
export const Insight = ({ sliceName }: { sliceName: string }) => {
  const insight = st.slice[sliceName].use.taskInsight();
  if (!insight) return null;
  return <Task.View.Stats taskInsight={insight} />;
};
```

---

### Recipe 7: Migrating `page/` to the Route Chain

A route file used to be a default function beside named exports (`pageConfig`, `head`, `generateHead`, `Loading`,
`fonts`, …). It is now one chain, and the chain is also what publishes a screen to agents. The legacy shape still
loads and logs one warning per file at boot (`… uses the legacy route shape …`); migrate file by file, then run
`bun run akan typecheck <app>` and `bun run akan lint <app>`.

```tsx
// before — page/(user)/project/[projectId]/_index.tsx
import { fetch, usePage } from "@apps/<app>/client";
import type { PageConfig } from "akanjs/client";

interface PageProps {
  params: { projectId: string };
  searchParams: { tab?: string };
}
export function generateHead({ params }: PageProps) {
  return <title>{params.projectId}</title>;
}
export default async function Page({ params: { projectId }, searchParams }: PageProps) {
  const { l } = usePage();
  const { projectView } = await fetch.viewProject(projectId);
  return <Project.Zone.View view={projectView} tab={searchParams.tab} />;
}
export const pageConfig = { transition: "stack" } satisfies PageConfig;

// after
import { fetch, usePage } from "@apps/<app>/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";

export default page()
  .param("projectId", ID, { desc: "The project to show." })
  .search("tab", String)
  .config({ transition: "stack" })
  .head(({ projectId }) => <title>{projectId}</title>)
  .prompt("briefProject", "Brief one project: its status and what is due.")
  .render(async ({ projectId, tab }) => {
    const { l } = usePage();
    const { projectView } = await fetch.viewProject(projectId);
    return <Project.Zone.View view={projectView} tab={tab} />;
  });
```

| Legacy export | Chain stage |
|---|---|
| `interface PageProps { params }` + `[x]` folder | `.param("x", ID \| String \| Int \| …)` — one per `[x]` segment, every one of them, in path order |
| `searchParams.k` | `.search("k", Type)`; `[Type]` for a repeated key; the value arrives typed and optional |
| `params.lang` | `lang` — on every route's `.render()`, `.head()` and `.loading()` with no stage; `.param("lang")` is refused |
| `export const pageConfig = {…}` | `.config({…})` — `devOnly` stays a literal |
| `export const head = <…/>` / `generateHead({ params })` | `.head(<…/>)` / `.head(({ x }) => <…/>)` |
| `export const metadata` / `generateMetadata` | `.head(<><title>…</title><meta name="description" content="…" /></>)` — there is no object form |
| `export function Loading()` | `.loading((args) => …)` |
| `export default async function Page({ params, searchParams })` | `.render(async ({ x, k }) => { …same body… })` — `async` only if it awaits |
| `_layout.tsx`: `export default function Layout({ children })` | `layout().render(({ children }) => …)` |
| `export function NotFound` / `export function Error` | `.notFound(fn)` / `.error(fn)` on `layout()` |
| root `_layout.tsx`: `fonts`, `theme`, `manifest`, `reconnect`, `wsConnect`, `layoutStyle` | `rootLayout().fonts([…]).theme("dark").manifest({…}).reconnect(false).wsConnect(false).layoutStyle("web")` |
| root `_layout.tsx`: `gaTrackingId` | none — render the app's own `"use client"` analytics component from the root layout's `.render()` |
| `prompt()` on `endpoint()` (removed) | `.prompt(name, description)` on the page that shows the same screen |

Rules the loader and `akan sync` enforce: a chain module has no other export; `page()` belongs in a page file and
`layout()` / `rootLayout()` in a `_layout.tsx`; a page names every `[x]` of its path, a layout may name a subset;
`.param()` and `.prompt()` names are string literals; `import "./styles.css"` stays the first line of a root layout;
`_overrides.tsx` is untouched. MCP: `prompts/get` now runs the page's body under the caller's token and hands the
model the description, what the page fetched, and the tools of those modules — see `mcpRule`.

---

### Recipe 8: Migrating the LLM Adaptor and the Removed `--ai` Commands

Two changes land together. The runtime LLM seam now names a wire rather than a vendor, and the CLI's AI editor is
gone. They touch different files and neither one is optional — the first breaks a build or, worse, degrades
silently; the second breaks a script that calls a command that no longer exists.

#### The adaptor, in `lib/option.ts` and `env/env.server.*.ts`

`DeepseekLlm` is deleted. `OpenaiLlm` is the default and speaks the chat-completions dialect to whatever `host`
names, so DeepSeek, Groq, Together, OpenRouter, Ollama and a self-hosted vLLM are the same class with a different
`host` and `model`. `AnthropicLlm` is unchanged.

```ts
// before — env/env.server.local.ts
export const env: ModulesOptions = {
  ...libEnv,
  llm: { apiKey: process.env.DEEPSEEK_KEY },
};

// after — the default model and host are gone, so name both
export const env: ModulesOptions = {
  ...libEnv,
  llm: { apiKey: process.env.DEEPSEEK_KEY, model: "deepseek-v4-flash", host: "https://api.deepseek.com" },
};
```

| Before | After | What happens if you skip it |
|---|---|---|
| `setLlm({ apiKey })`, relying on the DeepSeek default | `setLlm({ apiKey, model, host })` | The app boots, the log warns once, and the chat answers `llmUnavailable` to every turn |
| `applyAdaptor(LlmAdaptorRole, DeepseekLlm)` | `OpenaiLlm` + `host: "https://api.deepseek.com"` | Build error — the class is gone |
| `OpenaiLlm` pointed at a **named** `host`, reading images | add `accepts: { image: true }` to `setLlm` | **Silent**: images reach the model as a note saying they could not be read |
| An adaptor of your own throwing `agent.error.<vendor>RequestFailed` | `new Err("agent.error.llmRequestFailed", { provider, status, reason })` | The chat prints the raw key instead of a sentence |
| Provider settings in a second `option.use({ myLlmOption })` | put them in `setLlm` and read `use<MyLlmOption>()` | Nothing breaks; the second channel is no longer needed |

`OpenaiLlm` claims vision for its default host (`https://api.openai.com/v1`) and for nothing else, because a host
you named is a gateway it knows nothing about — and bytes handed to a model that cannot decode them kill the whole
turn on a 400, where text-only degrades them to a note. Declare `accepts` whenever you set `host`.

`LlmOption` is now a floor rather than the whole shape: `setLlm` carries whatever else it is handed to the role, so
an adaptor of your own declares `interface MyLlmOption extends LlmOption { region: string }`, reads it with
`use<MyLlmOption>()`, and stops needing a config channel beside `setLlm`.

#### The CLI, in scripts and CI

`AiSession` and every command that drove it are removed. There is no replacement command — the workspace's agent
surface (`akan context`, the MCP tools, `akan guideline show`) is what feeds a coding agent now.

| Removed | What to do instead |
|---|---|
| `akan create-module <name> --ai`, `akan create-scalar <name> --ai` | Drop the flag. The command scaffolds the same files it always did; write the constant and dictionary yourself or let a coding agent do it against `get_guideline modelConstant` / `modelDictionary` |
| `akan compact <app-or-lib>` | Edit the `*.abstract.md` by hand. `akan quality scan` still warns past 300 lines |
| `akan set-llm`, `akan reset-llm`, `akan ask` | Nothing. The runtime LLM is `option.setLlm(...)` and has never been this config |
| `akan generate-instruction`, `akan update-instruction`, `akan generate-document`, `akan reapply-instruction` | Nothing. `akan guideline list` / `show` still read the bundled guidelines |
| `import { AiSession } from "@akanjs/devkit/aiEditor"` | Nothing — the module is gone |

`~/.akan/config.json` keeps an `llm` entry if it had one. It is ignored; delete it, because it holds an API key.

Then: `bun run akan typecheck <app>`, `bun run akan lint <app>`, and one agent turn in the browser to confirm the
provider answers.

### Data Flow Summary

For each business question, follow this chain:

| Question | File Pattern |
|----------|-------------|
| What fields does it have? | `constant.ts` — `via()` layers: Input → Object → Light → Model → Insight |
| How is it stored/searched? | `document.ts` — `from()` filters + `by()` document methods + `into()` model |
| What business rule should run? | `service.ts` — `serve()` with DI (`use`, `service`, `plug`, `env`, `memory`) |
| What should a page call? | `signal.ts` — `internal()` (jobs), `endpoint()` (APIs), `slice()` (data views) |
| What client state is shared? | `store.ts` — `store()` with auto-generated form/insight state + custom actions |
| What should users see? | `View.tsx` + `Zone.tsx` (detail/container), `Template.tsx` (forms), `Unit.tsx` (cards), `Util.tsx` (buttons) |


## Auto-Generated API Reference

akan sync automatically generates APIs across all layers. Only write custom logic — never hand-write what the framework generates.

### Signal — Endpoint Auto-Generation

| Auto-Generated | Signature | Description |
|---------------|-----------|-------------|
| `view[Model](id)` | `fetch.viewTask(id)` | Fetch single model for detail view |
| `edit[Model](id)` | `fetch.editTask(id)` | Fetch model for edit view |
| `merge[Model](id, data)` | `fetch.mergeTask(data)` | Create (no id) or update (with id) model |
| `[model]List[Suffix](args, skip, limit, sort)` | `fetch.taskListInTodo(args)` | Paginated list from slice filter |
| `[model]Insight[Suffix](args)` | `fetch.taskInsightInTodo(args)` | Aggregated insight from slice query |
| `init[Model][Suffix](args)` | `fetch.initTaskInTodo(args)` | Initialize slice with list + insight |

**Rule**: Only define `query()`, `mutation()`, `message()`, `pubsub()` endpoints manually when the endpoint needs custom business logic. Standard CRUD is already auto-generated.

### Service — CRUD & Query Auto-Generation

| Auto-Generated | Description |
|---------------|-------------|
| `this.<model>Model` | Auto-injected model adaptor |
| `get<Model>(id)`, `load<Model>(id)` | Single document lookup |
| `create<Model>(data)`, `update<Model>(id, data)`, `remove<Model>(id)` | CRUD operations — named after the model, e.g. `createTask`/`updateTask`/`removeTask` (there is no literal `createModel`) |
| `list<Query>(args)`, `find<Query>(args)`, `pick<Query>(args)` | Filter-based queries |
| `exists<Query>(args)`, `count<Query>(args)`, `insight<Query>(args)` | Filter-based helpers |
| `_preCreate`, `_postCreate`, `_preUpdate`, `_postUpdate`, `_preRemove`, `_postRemove` | Lifecycle hooks (override to add logic) |

**Rule**: Use `_preCreate`/`_postCreate` lifecycle hooks for side effects (e.g., push workHistory entries). Write custom service methods only for multi-model orchestration.

### Store — State & Action Auto-Generation

| Auto-Generated | Description |
|---------------|-------------|
| `[model]` (cached full model), `[model]Loading`, `[model]Form`, `[model]Modal` | Base model states |
| `create[Model](data)`, `update[Model](id, data)`, `remove[Model](id)` | CRUD actions |
| `new[Model](partial)`, `edit[Model](model)`, `view[Model](model)` | Form/view state actions |
| `[slice]List`, `[slice]InitList`, `[slice]Insight`, `[slice]Selection`, `hasMoreOf[Slice]` | Slice states |
| `init[Slice](args)`, `refresh[Slice]()`, `setPageOf[Slice](page)`, `loadMoreOf[Slice]()` | Slice actions |
| `set[Field]On[Model](value)` | Auto-setters for each model field |

**Rule**: Write custom store actions only for toast messages (`msg.loading`/`msg.success`) or multi-step workflows. State fields and CRUD actions are already auto-generated.

### Document — Filter Query Auto-Generation

| Auto-Generated (from Filter definition) | Description |
|----------------------------------------|-------------|
| `list[Query](args)`, `listIds[Query](args)` | List documents matching filter |
| `find[Query](args)`, `findId[Query](args)` | Find one (null if not found) |
| `pick[Query](args)`, `pickId[Query](args)` | Find one (throw if not found) |
| `exists[Query](args)`, `count[Query](args)` | Existence check and count |
| `insight[Query](args)`, `query[Query](args)` | Insight and raw query |
| `remove[Query](args)`, `removeOne[Query](args)` | Query-level soft remove — all matches, or the newest one (`createdAt` desc, not caller-chosen) |
| `update[Query](args).set(patch)`, `updateOne[Query](args).set(patch)` | Query-level update — the patch lands on a terminal `.set()`, because a filter's trailing args may be optional |

**Rule**: Define `Filter` with `.query()` conditions in `document.ts`. akan sync auto-generates all 14 query helper methods per filter. Write `Document` chain methods only for state transitions with validation.

**The four query-level writes fire no hooks**, so no `_pre`/`_postRemove` and no cascade run — same as `updateManyByQuery`. Reach for them when the model carries no removal side effect; otherwise remove documents one at a time. A filter keyed after its own model (filter `chat` on model `chat`) is rejected at boot, because `removeChat`/`updateChat` would otherwise shadow the generated single-document CRUD.
