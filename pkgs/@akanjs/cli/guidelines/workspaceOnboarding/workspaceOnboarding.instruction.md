## Workspace Layout

- `apps/<app>` contains application pages, app UI, app domain modules, env files, and `akan.config.ts`.
- `libs/<lib>` contains shared domain and utility code reused by apps.
- `apps/<app>/lib/<model>` holds database-backed domain modules, `lib/_<service>` service modules, and
  `lib/__scalar/<scalar>` reusable value types. Module abstracts sit beside the code as `<name>.abstract.md`.
- `apps/<app>/page` holds server-side file-routed pages: `<routeName>.tsx` serves `/routeName`, a directory's
  `_index.tsx` serves that directory, `_layout.tsx` nests a layout, and `[modelId]` is a dynamic segment. Each route
  file is one chain — `export default page()…render()`, or `layout()` / `rootLayout()` in a `_layout.tsx`.
- The `native` section of `akan.config.ts` makes the app an iOS, Android and desktop app built from the same pages,
  and `apps/<app>/native/<id>` holds a native plugin the app owns.

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

### Native Apps — iOS, Android, Desktop

`native: { desktop: { server: true } }` in `akan.config.ts` is all a desktop app that carries its own server needs.
A `start-*` command loads its pages from `akan start`, so run that first; a desktop app that carries its server
starts it itself. The full contract — targets, updates, what the carried server ships — is
`akan guideline show runtimeRule`.

```bash
akan start-desktop <%= appName %>                   # Run the desktop app on this computer
akan start-ios <%= appName %>                       # Run it in a simulator or on an iPhone (start-android alike)
akan build-desktop <%= appName %>                   # Build it for this computer into .akan/native/<target>/build
akan build-desktop <%= appName %> --installer true  # Windows: add a per-user setup program
akan update-keygen <%= appName %>                   # Make the update signing key once; print its public key
akan publish-update <%= appName %>                  # Build and sign a desktop release to upload to updates.url
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
| Make the app an iOS, Android or desktop app | `akan.config.ts` → `native: { … }`; `desktop: { server: true }` puts the server in the desktop app | `akan start-desktop <name>` (or `start-ios` / `start-android`) |
| Add a device capability the framework lacks | `native/<id>/` → `native-plugin.json`, `src/index.ts` (page API, used from a `webkit/` hook), `src/desktop.ts`, Kotlin, Swift | the platform's `akan start-*` |

## Workflow Recipes

Six worked recipes carry the full code for the most frequent Akan changes, together with the reference of what
`akan sync` generates at each layer. They are **not** inlined here — fetch them when you are about to do one:
`get_guideline` with `workspaceRecipes`, or `akan guideline show workspaceRecipes`.

| Recipe | Covers |
|---|---|
| 1. Adding a field to a model | the five `constant.ts` classes, the dictionary entry, the store form, `akan sync` |
| 2. Injecting a dependency into a service | `service<srv.XService>()`, `plug(Adapter)`, `env(...)`, `use<T>()` |
| 3. Creating and using a slice | `slice()` guards, the generated `init<Model><Suffix>`, `Load.Units` hydration |
| 4. Creating a mutation endpoint | the document chain method, the service call, the signal `guards`, the store action |
| 5. Internal triggers | `internal()` with interval and cron |
| 6. Creating an insight | the `XInsight` class, the aggregation, the dashboard tile |
| Data Flow Summary | how a value travels page → store → signal → service → document → DB |
| Auto-Generated API Reference | what signal, service, store, and document each generate — never hand-write these |

The rules those recipes obey are in this file; the recipes only show the code. When you edit a file, read the
existing content first and change only the relevant sections — never rewrite a whole file.

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
- **Reading a secret field needs an explicit select, and the two call sites spell it differently.**
  `field(...).secret()` values are stripped from query results by default. The model facade takes the projection
  **bare** — `this.userModel.pickById(id, { passwordHash: true })`, likewise `pickOne` / `find` / `findOne` /
  `findById`. A generated filter accessor takes it **inside the option object** —
  `this.userModel.findByAccountId(accountId, statuses, { select: { passwordHash: true } })`. Handing `{ select: … }`
  to the facade selects a field named `select`, which no model has: the value arrives empty, with no error.
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
- **SSR auth-gated pages: guard at the layout.** Check the session inside the `_layout.tsx` chain's `.render()` and
  redirect when it is absent, so nested pages never render for signed-out users.

