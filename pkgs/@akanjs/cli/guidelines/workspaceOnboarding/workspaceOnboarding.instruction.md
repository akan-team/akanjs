## Workspace Layout

- `apps/<app>` contains application pages, app UI, app domain modules, env files, and `akan.config.ts`.
- `libs/<lib>` contains shared domain and utility code reused by apps.
- `apps/<app>/lib/<model>` holds database-backed domain modules, `lib/_<service>` service modules, and
  `lib/__scalar/<scalar>` reusable value types. Module abstracts sit beside the code as `<name>.abstract.md`.
- `apps/<app>/page` holds server-side file-routed pages: `<routeName>.tsx` serves `/routeName`, a directory's
  `_index.tsx` serves that directory, `_layout.tsx` nests a layout, and `[modelId]` is a dynamic segment.

The file roles inside a module — which file owns persistence, business logic, state, and each UI shape — are in
the convention set above under **Domain Module Conventions**.

## Agent Workflow

1. Read the nearby module and convention before creating files. If `*.abstract.md` exists, read it first.
2. Put new files in the established Akan location instead of adding parallel architecture.
3. Prefer Akan MCP workflows before direct source edits. Start with `akan mcp --mode plan` for `list_workflows`, `explain_workflow`, and `plan_workflow`.
4. If `plan_workflow` returns `planPath` or `next.tool=apply_workflow`, call `apply_workflow({ planPath })` before direct source edits.
5. Use `akan mcp --mode apply` only for allowlisted `apply_workflow`, `run_validation`, and repair tools.
6. After `apply_workflow`, run `run_validation` with `validationTarget` when present; otherwise use `applyReportPath`.
7. Direct source edits are denied when an allowlisted Akan workflow or repair tool can perform the change.
8. If no workflow exists, or apply reports unsupported/no-op/failed diagnostics that require manual action, edit only the owning source files and never patch generated files directly.
9. Treat `AKAN_PUBLIC_*` env vars as public. Never put secrets in them.
10. Add or update tests when behavior, contracts, or CLI output changes.
11. Update `*.abstract.md` when business invariants, workflows, or public behavior change.
12. Run the smallest relevant verification command after changes. After touching any `.tsx`, that includes
    `akan quality ssr`.

The rules for where code goes, the client/server boundary, and SSR discipline are in the convention set above;
this section covers only the order of operations.

## Common Commands

Run commands from the workspace root unless a task says otherwise.

### Module Addition Workflow

When adding a new database-backed domain module (e.g., product, user):

```bash
# 1. Scaffold the module with Akan CLI (creates constant, service, signal, store, document files)
# The target app/lib is a POSITIONAL argument, not a --app flag.
akan create-module <module-name> <%= appName %>

# 2. Start dev server with HMR and type checking at http://localhost:8282
akan start <%= appName %>
```

### Change Verification Workflow

After any code change, run these in order:

```bash
# 1. Fast lint check — Akan.js conventions and Biome rules
akan lint <%= appName %>

# 2. Type-only check — catches server/client boundary violations and import errors
akan typecheck <%= appName %>

# 3. Test — Run the test code (lib/*/*.signal.test.ts or others)
akan test <%= appName %>

# 4. SSR balance — only after touching .tsx files. Reports the server render share
#    per app/lib and flags client code that should render on the server.
akan quality ssr

# 5. Full production build — bundles the app, runs all type/lint checks combined
akan build <%= appName %>
```

**Verify endpoints with signal tests, not raw HTTP.** The canonical way to check a query/mutation/slice
contract is an in-memory signal test (`<model>.signal.test.ts`), using the test fetch harness
(`getOrSetupSignalTestFetch`) — it is fast, needs no running server, and exercises `fetch.*`, `view/edit/merge<Model>`,
and slice `init`/`list`/`insight` directly. Prefer it over `curl`: the dev gateway locale-prefixes routes (`/en/...`),
so hand-rolled HTTP calls against a raw path can redirect unexpectedly. See `akan test <%= appName %>`.

### Other Frequently Used Commands

```bash
akan create-scalar <scalar-name> <%= appName %>          # Add a scalar module (lib/__scalar/<scalar-name>/)
akan create-service <service-name> <%= appName %>        # Add a service module (lib/_<service-name>/)
akan test <%= appName %>                             # Run the test code (lib/*/*.signal.test.ts or others)
akan lint <%= appName %>                             # Lint only (no typecheck)
akan quality scan                                # All code-quality warnings + SSR balance
akan quality ssr                                 # SSR balance and client-boundary warnings only
```

**CLI argument conventions.** Two argument styles, and mixing them up is a common mistake:

- Scaffolding and whole-app commands take the target app/lib as a **positional** argument, not a flag:

  ```bash
  akan create-module photo <%= appName %>
  akan create-scalar money <%= appName %>
  akan create-service billing <%= appName %>
  akan sync <%= appName %>
  ```

- Only the source-limited field commands use `--app`/`--module` flags:

  ```bash
  akan add-field --app <%= appName %> --module photo --field width --type Int
  akan add-enum-field --app <%= appName %> --module photo --field status --values draft,active
  ```

Passing `--app` to `create-module` is not recognized, and the target app will not resolve.

For the default generated app, start with:

```bash
akan start <%= appName %>
```

### The Essential Loop: Workflow -> Sync -> Check

Almost every Akan.js change follows this pattern. **Missing sync or repair is the #1 cause of agent confusion.**

> **If the Akan MCP tools are not connected in your agent, skip straight to the CLI-only fallback below.**
> `akan mcp --mode plan/apply` starts a stdio MCP server that only works when your agent is wired to it as an
> MCP client. When those `list_workflows` / `plan_workflow` / `apply_workflow` tools are not available, the CLI
> commands are a fully supported, first-class path — you are not losing any capability by using them.

1. **Plan** — Ask the Akan MCP server for the workflow first.
   ```
   akan mcp --mode plan
   # use list_workflows, explain_workflow, and plan_workflow
   ```

2. **Apply the plan** — If `plan_workflow` returns `planPath` or `next.tool=apply_workflow`, call
   `apply_workflow({ planPath })`. Do not copy the workflow plan into direct source edits.
   ```
   akan mcp --mode apply
   # use apply_workflow, run_validation, repair_generated, repair_imports, or repair_module_shape
   ```

   Direct edits are fallback only: use them after `list_workflows`/`explain_workflow` confirm no matching workflow, or
   after apply reports unsupported/no-op/failed diagnostics that require manual action. Keep fallback edits to owning
   source files such as `task.constant.ts`, `task.dictionary.ts`, `Task.Template.tsx`, or `Task.Unit.tsx`.

3. **Validate the apply report** — Use the apply report artifact, not the original raw plan, when it is available.
   ```
   # run_validation with validationTarget first; otherwise use applyReportPath
   ```

4. **Sync or repair** — Regenerate barrel files so Akan discovers your change. This regenerates:
   `cnst.ts`, `db.ts`, `srv.ts`, `sig.ts`, `st.ts`, `dict.ts`, `useClient.ts`, `useServer.ts`,
   `ui/index.ts`, `webkit/index.ts`, `srvkit/index.ts`, `common/index.ts`, and all module `index.ts` files.
   ```
   akan sync <%= appName %>
   # or: akan repair generated --app <%= appName %>
   ```
   **CRITICAL**: Sync after EVERY file add, delete, or rename. Without sync, other modules cannot
   `import * as cnst from "../cnst"` and find your new model.

5. **Check** — Verify your change compiles and lints.
   ```
   akan start <%= appName %>   # dev server with live feedback (preferred)
   akan lint <%= appName %>    # quick lint-only check
   akan doctor --strict        # structured workspace diagnostics
   ```

   If `akan sync` gives errors, try:
   - `akan build <%= appName %>` — full rebuild catches type errors sync may miss
   - Re-run `akan create-module <name> <%= appName %>` if the scaffold is corrupted

For compound natural-language requests, split the request into workflows and apply each artifact in order. For example,
"create a project module and add a budget field" should run `create-module` plan/apply first, then `add-field`
plan/apply, then validation/doctor on the returned `validationTarget`.

### CLI-Only Fallback (MCP Not Connected)

When the Akan MCP tools are not loaded, run the CLI commands directly. Each MCP tool maps 1:1 to a CLI command,
and the CLI emits the same structured report via `--format json`:

| MCP tool | CLI-only equivalent |
|----------|---------------------|
| `list_workflows` | `akan workflow list` |
| `explain_workflow <name>` | `akan workflow explain <name>` |
| `plan_workflow <name> ...` | `akan workflow plan <name> ... --format json --out <planPath>` |
| `apply_workflow { planPath }` | `akan workflow apply <planPath> --format json` (add `--dry-run` to preview) |
| `run_validation { validationTarget }` | `akan doctor --strict --format json` (or `akan typecheck <%= appName %>`) |
| `repair_generated` / `repair_imports` / `repair_module_shape` | `akan repair generated\|imports\|module-shape --app <%= appName %> --format json` |

The scaffolding primitives (`akan create-module`, `akan create-scalar`, `akan create-service`, `akan add-field`,
`akan add-enum-field`) are the same primitives the workflows call, so `create-module <name> <%= appName %>` followed
by `akan sync <%= appName %>` is equivalent to running the `create-module` workflow. Direct source edits remain the
final fallback when no CLI command covers the change.

## Quick Decision Matrix — "Where do I put this code?"

| You want to... | Create in... | Run after... |
|----------------|-------------|--------------|
| Define a new database-backed noun (e.g., User, Product) | `lib/<model>/` → constant, document, service, signal, store, dictionary, abstract | `akan sync <name>` |
| Add a pure workflow / integration (e.g., Payment, Email) | `lib/_<service>/` → service, signal, store, dictionary, abstract | `akan sync <name>` |
| Add a reusable value type (e.g., Address, WorkHistory) | `lib/__scalar/<type>/` → constant, dictionary, abstract | `akan sync <name>` |
| Create a new URL-visitable page | `page/` → `_index.tsx`, `_layout.tsx`, `[param]/_index.tsx` | Rebuild (akan start auto-detects) |
| Change the app color theme / design tokens | `apps/<app>/page/styles.css` → override the semantic token values under `:root, [data-theme="dark"]` and `[data-theme="light"]` (`--primary`, `--background`, `--foreground`, …) | akan start hot-reloads |
| Add a form or reusable UI component | `ui/` → PascalCase `.tsx`, **no** `"use client"` unless it uses a hook, event handler, store, or browser API | `akan sync <name>` |
| Add a React hook or browser helper | `webkit/` → camelCase `.ts` with `"use client"` | `akan sync <name>` |
| Add a server-only guard, middleware, or adaptor | `srvkit/` → PascalCase `.ts` | `akan sync <name>` |
| Add a pure helper (no DOM, no server API) | `common/` → camelCase `.ts` | `akan sync <name>` |

## Workflow Recipes

Concrete step-by-step recipes for the most frequent Akan.js changes. Each recipe shows which files to edit
and in what order. The code examples reference the `task` module in `apps/<%= appName %>/lib/task/` as a
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

Three patterns: injecting an **external adapter** (`use<>()`), another **module's service** (`service<>()`),
or a **predefined framework adapter** (`plug()`). A field named `<refName>Service` resolves to the service
registered under `<refName>` — the `Service`/`Signal` suffix is required and stripped to derive the lookup key.

> **For a new adapter you own, prefer the `adapt()` shape in pattern C over the `option.ts` registration in
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

// 4. In page — Init the slice in an async Page and hand the init to a Zone.
export default async function Page() {
  const [{ taskInitInTodo }] = await Promise.all([fetch.initTaskInTodo()]);
  return <Task.Zone.Card init={taskInitInTodo} sliceName="taskInTodo" />;
}
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

## Modeling & Query Gotchas

A short list of things the type system does not always catch. The full rules for text search, `cascade`, and the
query-level writes are in the convention set above; these are the shapes that build green and fail later.

- **Slices return a query, not a list.** A slice `exec` must return `this.<model>Service.query<Filter>(...)`, never
  a `list<Filter>(...)` / `listBy...(...)` array. Returning an array type-checks but fails at runtime with
  `Unknown document field path: 0`. (See Recipe 3.)
- **Custom endpoint names must not collide with generated CRUD.** `create/update/remove/view/edit/merge<Model>`
  already exist. A collision can build green and fail only at runtime — pick a distinct verb.
- **Numbers are `Int` or `Float`, never `Number`.** `field(Number)` / `.body("x", Number)` fail to typecheck.
- **Array fields use `field([T])`** — `tags: field([String])`, `images: field([File])`.
- **Reading a secret field needs an explicit select.** `field(...).secret()` values are stripped from query results
  by default: `this.userModel.pickById(id, { select: { passwordHash: true } })`.
- **`cascade` names a direction, and the wrong one is a data loss** — `removeRef` on the relation the owner holds,
  `removeWith` on the child's reference to its owner. A query-level removal fires no hooks and therefore no cascade.
- **`q.search()` is a filter node, not a slice requirement.** `bySearch: filter().arg("text", String).query((text,
  q) => q.search(text, { prefix: true }))` generates `listBySearch` / `countBySearch` / `queryBySearch` /
  `insightBySearch` for free. Only add a search *slice* when the model's data is safe to enumerate.

## Current User, Guards & Auth-Gated Pages

Built-in user authentication (session / JWT / password hashing) ships as a separate Akan auth library, not in the
core framework. The core framework gives you the composition points below; wire the auth library through them.

- **A `slice()` takes its guard map as a second argument**, `slice(srv.task, { guards: { root: Admin, get: SignedIn,
  cru: SignedIn } }, (init) => ({...}))`. An `endpoint()` takes no guard argument at all —
  `endpoint(srv.task, ({ mutation }) => ({...}))` — so **every custom `mutation` / `query` / `message` names its own
  `guards: [...]` array**: `mutation(cnst.Task, { guards: [SignedIn] })`. `Public` always allows; other guards
  implement the `Guard` interface in `srvkit/` (server-only).
- **Read the caller inside a guard** with `context.get<T>("account")`, which works on HTTP and websocket calls
  alike — never branch on `getHttpContext()` / `getWebSocketContext()`. Every guard class also declares
  `static scope: GuardScope`, `"account"` or `"resource"`, with no default.
- **Read the current user inside a custom endpoint** by injecting an `InternalArg` with `.with(...)`:
  `mutation(cnst.Task, { guards: [SignedIn] }).with(CurrentUserId).exec(async function (currentUserId) { ... })`.
- **Auto-generated CRUD and `serve()` service methods / lifecycle hooks do not receive session context.** If an
  operation needs the acting user, expose a custom endpoint that takes it via `.with(CurrentUserId)` — never trust a
  client-supplied user id.
- **SSR auth-gated pages: guard at the layout.** Check the session in the `_layout.tsx` loader and redirect when it is
  absent, so nested pages never render for signed-out users.

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
| `[slice]List`, `[slice]InitList`, `[slice]Insight`, `[slice]Selection` | Slice states |
| `init[Slice](args)`, `refresh[Slice]()`, `setPageOf[Slice](page)` | Slice actions |
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
