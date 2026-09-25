# Akan.js Monorepo — Agent Guide

This is the canonical, tool-neutral guide for coding agents (Claude Code, Codex, Cursor, and others)
working in this repository. It consolidates the rules in `.cursor/rules/*.mdc`, which remain the
Cursor-native copies. Keep this file as the single source of truth: `CLAUDE.md` imports it, and when a
rule changes, update it here and mirror it into the matching `.cursor/rules/*.mdc` file.

## Repo Overview

- Akan.js is a full-stack TypeScript framework for building all-stack applications at once.
- Write one line and deploy across web, app, server, database, and infrastructure.
- Akan prioritizes actual business code by abstracting technical implementation details as much as possible.
- The goal is minimal code, high performance, and type-safe services that can deploy to web, mobile, server, and DB infrastructure together.
- This is a Bun-first Akan.js monorepo.
- Main top-level areas are `apps/`, `libs/`, `pkgs/`, and `infra/`.
- `apps/<app>` contains app-level pages, domain code, UI, env files, and `akan.config.ts`.
- `libs/*` contains shared domain and utility libraries.
- `pkgs/akanjs/*` contains framework, runtime, and tooling facets published through the single `akanjs` package. Prefer extending existing Akan facets before adding new framework-level patterns.
- `infra/` contains Helm, deployment templates, edge configs, and Jenkins env/secret scripts.

## Change Scope

- Keep edits scoped to the requested task and the directly related files.
- Do not reformat unrelated files or rewrite nearby code just for style.
- Do not revert or overwrite unrelated user changes in a dirty working tree.
- Prefer established nearby patterns over introducing a new abstraction.
- Add new abstractions only when they remove real duplication or match an existing project pattern.

## Lint-Enforced Rules (These Break The Build)

Enforced by `biome.json` and the grit plugins in `pkgs/@akanjs/devkit/lint/`. Several of them produce output
that looks wrong; do not "fix" it back.

- **Never hand-order Tailwind classes.** `nursery/useSortedClasses` is an error and also sorts the string
  arguments to `clsx()` and `cva()`. Sorter output such as `font-bold text-2xl text-base-content` or
  `border-base-content/5 border-t` is correct. Write the classes in any order, run the formatter, leave the result.
- **Never `throw new Error`.** Throw `new Err("<module>.error.<key>")` and register the key as `[en, ko]` in that
  module's dictionary `.error({})`. Import `Err` from `"../dict"` on the server and from `"@libs/<lib>/client"` or
  `"@apps/<app>/client"` in UI. `no-throw-raw-error.grit` exempts `*.test.ts`, `*.spec.ts`, `*.constant.ts`, and
  `common/**` — `common/` has no legal `Err` import path, so keep throwing code out of it.
- **Never import a third-party package** from `page/**`, from any barrel, or from any
  `*.{constant,dictionary,document,service,signal,store}.ts` / `*.{Template,Unit,Util,View,Zone}.tsx`
  (`no-import-external-library.grit`). Re-export the symbol through a lib first. One-line re-export shims such as
  `libs/<lib>/base/<pkg>.ts` and `libs/<lib>/webkit/<hook>.ts` exist for exactly this reason — they are
  load-bearing, not cruft. Do not delete them.
- **`#private` is banned in exactly four file suffixes:** `*.constant.ts`, `*.document.ts`, `*.service.ts`, and
  `*.store.ts` (`no-js-private-class-method.grit`). The rule is scoped by file path, not by class shape, so
  `#private` remains the house style everywhere under `srvkit/`, including `adapt()` adapter classes.
- **No `console.log` / `console.debug`.** Only `assert`, `error`, `info`, and `warn` are allowed. Server code uses
  the injected `this.logger.*` or `new Logger("ClassName")`.
- **Never redeclare a generated CRUD endpoint name** in `*.signal.ts` (`no-redeclare-predefined-endpoint.grit`).
- **No deep imports past a barrel** (`no-deep-internal-import.grit`). Cross-module constant references such as
  `../map/map.constant` are the sanctioned exception.
- **Server-component discipline** is enforced on `page/**`, `*.Unit.tsx`, and `*.View.tsx`
  (`no-import-client-functions.grit`, `no-use-client-in-server.grit`, `non-scalar-props-restricted.grit`).
- `noArrayIndexKey` and `useExhaustiveDependencies` are **off** on purpose: `key={idx}` for embedded scalars and
  short dependency arrays are intentional, not oversights.

## Coding Style (`**/*.{ts,tsx}`)

- For large units of work, prefer declaring a class and running the flow through an instance instead of scattering many standalone functions.
- Prefer class methods or `static` methods over unrelated top-level helper functions when the logic belongs to a class-level workflow.
- Prefer ECMAScript `#private` fields and methods over TypeScript `private`, except in the four suffixes where `#private` is lint-banned (`*.constant.ts`, `*.document.ts`, `*.service.ts`, `*.store.ts`) — those use TypeScript `private`. `#private` is the house style under `srvkit/`, including `adapt()` classes.
- In files that declare a class, avoid top-level functions or variables when they can reasonably live inside the class.
- Prefer `const` function expressions over `function` declarations unless hoisting, overloads, generators, or framework conventions make `function` the better fit.
- Prefer declaring only one class per file; split the file when two or more class declarations are needed.
- For class-centered modules, prefer noun-style filenames that match the primary class name, such as `RouteClientBuilder.ts`, instead of verb-style wrapper filenames like `buildRouteClient.ts`.
- Avoid keeping exported functions that only instantiate a class and immediately call one method. Prefer migrating callers to instantiate the class directly.
- Except for React component files or convention files, TypeScript filenames should use camelCase.
- In React components, keep one-off `className` strings inline. Only extract class name constants when the class is reused, conditionally composed, or too large to read comfortably in JSX.

### File Size And Duplication

- Keep files small. The house median is well under 50 lines; split a component before it reaches ~150 lines rather than adding section comments.
- Ship every scaffold file even when it is empty — `export class XInternal extends internal(srv.x, () => ({})) {}`, empty dictionary stages, the `// state` / `// action` markers in an empty store. They mark where things go.
- Never add a sibling helper file inside `lib/<model>/`. Helpers go to `common/`, `webkit/`, `srvkit/`, or `ui/`.
- Prefer duplication to premature abstraction at the leaf. Near-identical sibling modules and per-vendor pages are deliberately copied, not parameterised. Copy the file and change the literals; share enums by import only.

### TypeScript Shape

- Use `interface` for object shapes and `type` only for unions and aliases.
- Declare `interface <ComponentName>Props` immediately above the component with no blank line between, and put `className?: string` first. Name it for the component (`CardProps`, `WorldProps`), never for the model. Do not export it unless a sibling imports it.
- Never use a non-null assertion. Narrow with `?.`, an early return, or a type predicate such as `.filter((id): id is string => !!id)`.
- Escape with `as unknown as T`. Never `as any`.
- Never annotate a component's return type. Annotate a helper only when the return is a union, a tuple, or a type predicate.
- Use `as const` on every `enumOf(...)` array, every `via(Model, [...] as const, …)` Light tuple, and every module-scope lookup map. Never use the TypeScript `enum` keyword.
- Async functions carry no `Async` suffix.

### Test Code

- Write TypeScript tests with Bun's test runner and import `describe`, `expect`, and `test` from `bun:test`.
- Keep tests colocated with the source they cover using `*.test.ts` or `*.spec.ts`, following the existing nearby pattern.
- Prefer focused behavior tests for public contracts and edge cases over implementation-detail assertions.
- Run package suites with `bun run akan test <pkg>` from the repo root, or `cd <pkg> && bun test --isolate`. Plain `bun test` without `--isolate` shares one global object across test files and fails dozens of tests from cross-file state pollution (`bunfig.toml` `[test] isolate` is not honored as of Bun 1.3), and running `bun test` from the repo root breaks subprocess stdio pipes.
- Split signal tests in two. `<model>.signal.spec.ts` holds reusable fixtures built on `sampleOf(cnst.XInput)` with explicit `Promise<cnst.X>` return types and **no assertions**. `<model>.signal.test.ts` holds the assertions: `describe("<Model> Signal")`, `let` fixtures at describe scope, one `beforeAll`, story-ordered `it`s, and negatives via `await expect(p).rejects.toThrow()`.
- `lib/user/user.signal.spec.ts` is the one place agent types are re-exported and re-typed; import `UserAgent` / `AdminAgent` from there rather than from the shared lib directly.
- A placeholder `it` with a descriptive title is an acceptable floor. Write a real suite when the behaviour is security-relevant.

## Comments

Do not narrate code. Do document the thing the code cannot say. Both halves are the rule.

- Never add a comment that restates the identifier, the signature, or the control flow.
- Prefer clear names and structure so ordinary logic needs no explanation.
- Do not add JSDoc, section banners, or "why/how" comments for ordinary logic.
- Comment density tracks the layer, not the author: pages carry none, product `lib/` and `ui/` code stays under 1 %, and `srvkit/` adapters and `guards.ts` carry as much as the external constraints require.
- A comment is warranted for: a vendor spec or protocol quirk; an infrastructure constraint; a third-party library gotcha; security reasoning; why a rule that looks arbitrary is correct; a math derivation; a domain field's business meaning; a state transition above a document chain method; why an obvious alternative was rejected.
- In-code markers:
  1. `TODO` — unfinished work that must be tracked in-code
  2. `FIXME` — known broken or incorrect behavior that must be fixed
  3. `XXX` — dangerous / surprising hazard that a reader must not miss
  4. `//!` — disabled or must-fix code
  5. `//?` — an explanatory aside
  6. `//*` — a design note
  7. Deletion caution — warn why removing a line or block would break something non-obvious
- Keep allowed comments one short line when possible.
- Every suppression carries a reason: `// biome-ignore lint/<rule>: <why>`. Never a bare disable block.
- Match nearby file style: if the surrounding code has few comments, keep it that way.

## TypeScript And Imports (`**/*.{ts,tsx}`)

- Use Bun and ESM assumptions from the root `tsconfig.json`.
- Prefer path aliases over deep relative imports when crossing package boundaries.
- Use `akanjs/*` for framework facets, `@apps/*` for apps, `@libs/*` for shared libs, and `@contract/*` for contract code.
- Respect existing client/server entrypoints such as `@libs/shared/client`, `@libs/shared/server`, `@apps/akasys/client`, and `@apps/akasys/server`.
- Let Biome organize imports instead of manually reshuffling unrelated imports.
- Namespace the generated barrels in backend `.ts` files: `import * as cnst from "../cnst"`, `* as db`, `* as srv`. Use `import type * as srv` in services so the runtime graph stays lazy, and a value import in signals.
- In `.tsx` files use one flat named import from the package client path (`import { cnst, fetch, st, Ticket, usePage } from "@apps/<app>/client"`) — never a relative `../` import.

## Formatting And Linting

- Use Biome as the formatter and linter.
- Format with `bun run akan lint <appName>` from the repo root.
- Keep formatting consistent with `biome.json`: 2-space indentation, 120 line width, and double quotes for JS/TS.
- Avoid adding new `console` usage except accepted methods such as `console.error`, `console.info`, and `console.warn`.
- Do not make broad formatting-only changes in unrelated files.

## Client / Server Boundaries (`apps/**`, `libs/**`, `pkgs/akanjs/**`)

- Use `"use client";` at the top of client component files.
- Be careful when importing client-only code from page or layout modules.
- Keep page props serializable unless the existing route pattern clearly allows otherwise.
- In domain UI the boundary is mechanical, not a judgment call: `Template`, `Zone`, and `Util` are always client components with `"use client"` on line 1; `Unit` and `View` are always server components and never carry the directive.
- Preserve established domain file roles such as `.document.ts`, `.service.ts`, `.store.ts`, `.constant.ts`, and `.client.ts`.
- When unsure, inspect nearby files in the same app or package before introducing a new boundary pattern.

## React Components And Styling (`**/*.tsx`)

- Components are `export const X = ({ … }: XProps) => { return (…); };` — arrow const with a block body. `export default` is reserved for pages, layouts, and `lazy()` targets.
- Never `React.FC`, never `defaultProps`, never `PropsWithChildren`. Defaults go in the destructuring (`prefix = ""`); children are typed `children: ReactNode`.
- `"use client"` on line 1 above the imports is mechanical by file role: every `.Zone.tsx`, `.Template.tsx`, and `.Util.tsx` has it; no `.Unit.tsx` or `.View.tsx` ever does. `usePage()` is legal in server files.
- Conditional render is `cond ? <X/> : null`. Never `{cond && <X/>}` — in a `className` context it renders the literal string `"false"`. Early `return null` is for guard clauses only.
- Never hand-roll loading, empty, or list states. Use `Load.Units` / `Load.View` / `Load.Edit` with `renderItem`, `renderList`, `renderView`, and `renderEmpty`; `<Empty />` for a bare placeholder; and `Model.New` / `Model.Edit` / `Model.SureToRemove` for CRUD modals.
- Avoid hooks. `useState` is for modal-open, tab, draft-input, and drag state only — never for server data. `useEffect` must be a genuine effect such as subscribe-with-cleanup or one-shot init. Prefer `Tab` over a `useState` mode switch. `.Template.tsx` files contain zero `useState`.
- Forms are entirely store-driven: `value={xForm.field}` with `onChange={st.do.setFieldOnX}`, the setter passed by reference. Always use `Field.*`, never a bare `<input>` for a model field. Nested rows use `st.do.writeOnX("payments.3.name", v)` plus the generated `add<Field>OnX` / `sub<Field>OnX`.
- Read with `st.use.*` and write with `st.do.*`. Client components do not call `fetch.*`.
- Static class strings stay plain strings. Reach for `clsx` only for a conditional or to merge an incoming `className`, and merge the caller last: `clsx("base classes", conditional, className)`. `clsx` comes from `akanjs/client`. No `twMerge`, no `cn()`.
- Multi-slot components take extra named props (`wrapperClassName`, `bodyClassName`), never a `classNames` object.
- Use daisyUI semantic tokens with opacity modifiers (`text-base-content/60`, `border-base-content/10`, `bg-base-100/70`, `bg-primary/10`). Never use `dark:` — theming is the daisyUI theme block in `page/*/styles.css`. Raw hex belongs only in marketing surfaces; match the neighbouring files.
- Hoist enum→class lookups to a module-scope `as const` map typed `{ [key in cnst.XStatus["value"]]: string }`. Do not use `Record<...>`. Escalate the map to `webkit/` when a second module needs it.
- Use `<Link>` from `akanjs/ui` for internal navigation; `<a>` only for `mailto:` and external links.

## Naming And Language

- Component exports are role names — `Card`, `Sticker`, `General`, `Preview`, `Admin`, `World`, `Mesh`, `Remove`. The model comes from the namespace (`<Floor.Unit.Card>`), so never write `FloorCard`. `Util` exports are the endpoint verb minus the model noun (`Serve`, `Refund`, `Complete`, `Terminate`).
- Layer the verbs: the document chain method drops the model (`sign()`, `approve()`), the service keeps the bare verb, and the signal, store, and dictionary re-add it (`signScContract`). This keeps custom endpoints clear of generated CRUD and makes `st.do.X` read the same as `fetch.X`.
- Slice and filter names are prepositional: `inOrg`, `inProject`, `inPeriod`, `byStatuses`, `ofPortfolio`. Never `getXInY`, never `listX`.
- Handlers are `onX` props taking inline arrows. Do not extract a `handleX`.
- Booleans are `is*` / `has*` / `can*` / `show*` / `disable*`. Counters are `*Num`, indices are `idx`, collections are `*List` or plural. `SCREAMING_SNAKE` is unused; module-scope tables are camelCase + `as const`.
- Keep existing domain vocabulary and its typos. Transliterated domain terms and misspelled identifiers already in use are load-bearing — renaming them silently breaks callers that match on the name.
- Identifiers, type names, endpoint names, and log messages are **English, always**. Everything a user reads goes through `l("model.field")` or `l.trans({ en, ko })` — never a hard-coded string in JSX, never `window.alert`.
- Dictionary entries are `[en, ko]` pairs, and nearly every label also carries a `.desc([en, ko])` even when it repeats the label. English labels are Title Case, Korean is the plain domain term, and `.error()` Korean ends in `다.`.

## Domain Module Conventions (`apps/**/lib/**`, `libs/**/lib/**`)

- Organize business concepts as domain folders under `lib/`; keep related schema, service, signal, store, and UI files together.
- Use lowercase logic files such as `<model>.constant.ts`, `<model>.document.ts`, `<model>.service.ts`, `<model>.signal.ts`, `<model>.dictionary.ts`, and `<model>.store.ts`.
- Use PascalCase React component files such as `<Model>.Template.tsx`, `<Model>.Unit.tsx`, `<Model>.View.tsx`, `<Model>.Zone.tsx`, and `<Model>.Util.tsx`.
- Treat `constant.ts`, `dictionary.ts`, and `signal.ts` as shared contract files that should avoid platform-specific dependencies.
- Keep backend persistence/query logic in `.document.ts` and domain business orchestration in `.service.ts`.
- Keep frontend state in `.store.ts`; use `Template` for forms, `Unit` for list/card items, `View` for details, `Zone` for composed page sections, and `Util` for domain-specific UI helpers.

### Module File Playbook

**`<model>.constant.ts`** — five classes in order with one blank line between them and `enumOf("camelName", [...] as const)`
classes above: `XInput → XObject → LightX → X → XInsight`. Write `XInsight` even when it is empty. Put display and
predicate logic on `LightX` (`isNew()`, `canWrite(user?)`, `formatTimes()`, `isCancellable()`) — the Light class is the
one both server and client hold, so shared logic belongs there instead of in a util module. This is the most commonly
missed rule in the codebase. Collection-level helpers go `static` on the full model. Give any field whose business
meaning is not obvious a short trailing comment.

**`<model>.document.ts`** — fixed order: `XFilter extends from(...)` → `X extends by(...)` → `XModel extends into(...)`,
with `sort: {}` always present. Chain methods validate → mutate → `return this`, and never `save()`; the caller saves,
so chains compose (`org.removeUser(id).removeInvite(id).save()`). Put a one-line comment above each stating the
transition. Atomic counters live on the Model class with the updater-callback form, returning `!!modifiedCount`.
Indexes and derived totals go in `static override _onSchema`, not in the service.

**`<model>.service.ts`** — keep methods to a few lines: load → chain → `return await ….save()`. Write `return await`
explicitly in tail position; do not "optimize" it away. Side effects belong in `override async _preUpdate` /
`_postCreate`, not inline. Fire-and-forget is explicitly `void`-ed. Order deliberately: load every referenced document,
then save, then notify. Return `null` / `false` for "not allowed" or "not found" and let the signal decide whether that
is an error.

**`<model>.signal.ts`** — `XInternal` → `XSlice` → `XEndpoint`, all three declared even when empty. `exec` is a one-liner
delegating to the service.

**`<model>.store.ts`** — write a custom action only for a toast, an optimistic update, or a multi-field write; most
stores need none, because state and CRUD actions are generated. The body is three lines: `await fetch.X` →
`this.setX(...)` → toast. The optimistic shape is mutate the client model, `void fetch.*`, then commit. Use
`this.pick(...)` when the value must exist, `this.get()` when it may not, and `this.set({...})` to write. Mutate lists
through the collection API (`this.set({ xList: xList.set(x).save() })`), not array spread. **Never
`import type { RootStore } from "../st"`** — it crashes `akan build` with a Bun SSR segfault.

**`<model>.dictionary.ts`** — fixed chain, with empty stages still written:
`.of() → .model() → .insight() → .query() → .sort() → .enum() → .slice() → .endpoint() → .error() → .translate()`.
Name every argument in `.arg()`, including framework-supplied `skip` / `limit` / `sort`. Use `modelDictionary`,
`scalarDictionary`, or `serviceDictionary` to match the module kind.

**`<module>.abstract.md`** — a title line, one declarative sentence naming what the module owns, a `## Rules` list of
two to five invariants the code cannot show, and an optional workflow arrow chain
(`draft -> signed -> active -> completed`). Never restate field lists or types. Update it whenever an invariant or
workflow changes.

## Service And Signal Conventions (`*.{service,signal}.ts`, `server/**`)

- Keep domain business operations in `.service.ts` classes built with `serve(...)`.
- Keep execution contracts and triggers in `.signal.ts` classes built with `internal(...)`, `slice(...)`, and `endpoint(...)`.
- Use `Internal` for internal triggers such as init, interval, cron, or queue jobs.
- Use `Slice` for typed data views that feed client stores and zones; keep each slice focused on one purpose.
- Use `Endpoint` for query and mutation contracts exposed to callers.
- Connect external APIs or infrastructure through adapters, usually under `srvkit/`, and inject them into services instead of importing vendor clients directly into domain logic.

### Guards And Transports

- Guards run on both HTTP and websocket calls. Read the caller with `context.get<T>("account")` (`pkgs/akanjs/signal/signalContext.ts`) instead of branching on `getHttpContext()` / `getWebSocketContext()`.
- Slice-level `guards` only reach the generated query/mutation endpoints. A `pubsub`/`message` endpoint is unguarded unless it declares its own `guards` in its signal option.
- A pubsub room is authorized once, at subscribe. When a socket's credential changes the framework re-runs each room's guards and unsubscribes the ones that now fail (`SignalResolver.revalidateWsRooms`), so guards must stay side-effect free and safe to re-run.
- A websocket carries its credential in the handshake snapshot on `ws.data` (`AppWsData`); clients that hold the token in memory send it with `fetch.setJwt(...)`, which forwards an auth frame over the socket.

### Authorization Defaults

- **Every `slice()` takes an explicit `{ guards: {…} }` second argument, and `root:` is always `Admin`.**
- **Every custom `mutation` / `query` / `message` names its own `guards: [...]` array.** Never rely on the slice default. `Public` belongs on a slice `get:`, never on a mutation.
- Resource guards are `Can<Verb><Model>` classes in `srvkit/guards.ts` that `implements Guard` with an `async canPass(context)`. They **fail closed**: no resource named ⇒ `false`; a load that throws ⇒ `logger.warn` then `false`. Admin bypass goes first.
- Keep `static name = "User";` on guard classes. `fetch` serializes guard names and the API explorer filters on them; it looks like dead code, and deleting it breaks the UI. Comment it so the next reader knows.
- The acting user arrives via `.with(Self)` / `.with(CurrentUserId)` / `.with(Me)`. Never trust a client-supplied id.
- Guards ship with the library that owns the model and are imported by its own signals through the package path, so a mounting app inherits authorization and cannot forget it.
- Services re-check ownership even when a guard already gated the call — two independent gates.
- `srvkit/guards.ts` earns real comments: explain what would leak without each guard.

### Signal Body Types

- `.body(...)` / `.param(...)` args accept `ConstantFieldTypeInput` only: scalars, model refs, or `enumOf(...)`.
- Numbers must use `Int` or `Float` — `Number` is rejected (`pkgs/akanjs/signal/endpointInfo.ts`).
- `Upload` is valid only inside a mutation flagged for file upload: `mutation([cnst.File], { fileUpload: true }).body("files", [Upload])` (see `libs/shared/lib/file/file.signal.ts`). It is not a model field type.

### Reserved Endpoint Names

- Auto-generated CRUD endpoints (e.g. `create<Model>`, `update<Model>`, `remove<Model>`) already exist for every model. Do not declare an `Endpoint`/`Slice` with a name that collides with them.
- The service layer surfaces such a collision as a typecheck error, but the signal layer can pass sync/typecheck/build and fail only at runtime — so treat name collisions as errors regardless of whether the build is green.

### Slices, Queries, and Hydration

- A slice's `exec` returns a `QueryOf` (an opaque query descriptor, `pkgs/akanjs/constant/types.ts`); you **cannot** chain `.sort()`/`.limit()` on it.
- Apply ordering/paging via the store `init` fetch option instead: `initX(..., { sort, page, limit })` (`pkgs/akanjs/fetch/fetchType/sliceFetch.type.ts`).
- Generated list accessors like `listBy(...)` return `Promise<Doc[]>`. For a chainable builder (`.sort().skip().limit().select()`) use the model facade's `findMany`/`findOne` (`FindManyChain`, `pkgs/akanjs/document/into.ts`).
- **Hydrated vs raw:** server queries return hydrated `cnst.<Model>` instances (with `set`/`save`/`refresh`); client fetch results are raw `GetStateObject` plain data (functions stripped, `pkgs/akanjs/base/types.ts`).

### Text Search In A Filter — `q.search()`

- Text search is a filter query node like any other: `bySearch: filter().arg("text", String).query((text, q) =>
  q.search(text, { prefix: true }))`. The generated `listBySearch` / `countBySearch` / `queryBySearch` /
  `insightBySearch` come for free — you do **not** need a slice to make search usable.
- **Only add a search slice when the model's data is safe to enumerate.** A filter is server-side; a slice is a
  client-callable endpoint, so on a model whose slice `get:` is `Public` a search slice hands anyone a way to walk the
  table. Leave that decision to the mounting app.
- `q.search()` compiles to a JOIN, not a WHERE fragment, so it **must sit at an AND position**. Nesting it under
  `q.any()` or `q.not()` throws, and it is rejected in `updateOneByQuery` / `updateManyByQuery` — a query-level write
  takes no join, so ignoring the node would silently widen the write to every other matching row.
- Blank or whitespace-only input matches **nothing**. Never "fix" that into a passthrough: a passthrough turns a
  search endpoint into a full listing.
- Order by relevance with the built-in `relevance` sort key. It is an empty sort map, which the store reads as
  "unspecified": score order when a search join is present, `createdAt` descending otherwise. That fallback is the
  compiler's own, not a model-defined default — redefining `latest` on the model does not change it.
- **A slice endpoint never reaches "unspecified".** The resolver fills `latest` before the query is built, so a
  client asking for the score order has to name `relevance`; leaving `sort` off gets `latest`, not relevance.
- Scope a search with `columns` (`q.search(text, { columns: ["title"] })`) and re-weight with `weights`, a tuple of
  finite numbers positional over `["title", "desc", "tag", "filter"]`.

### Service / Signal Injection

- Injected dependencies resolve by field-name convention: a field named `<refName>Service` resolves to the service registered under `<refName>`, and `<refName>Signal` likewise (`pkgs/akanjs/service/injectInfo.ts`).
- The `Service`/`Signal` suffix is required — the injector strips it to derive the registry lookup key. Name the field after the target refName plus the suffix, not arbitrarily.
- Preference order inside a service: `service<srv.XService>()` for another module's service · `plug(AdapterClass)` or `plug(StorageAdaptorRole)` for an adapter · `use<T>()` only to reach an `option.ts`-registered legacy singleton · `env(...)` for config.

### Adapters — `adapt()` And `plug()`

An injected singleton is an `adapt()` class in `srvkit/`. Write new adapters this way.

```ts
export class AdminNoti extends adapt("adminNoti" as const, ({ use, env, plug, memory }) => ({
  discordApi: use<DiscordApi>(),
  workspaceRoot: env(() => `~/build/${getEnv().environment}`),
  masterHost: plug(MasterHost),
  tokenMap: memory(Map, { of: String }),
})) {}
```

- Inject it with `plug(TheClass)` from a service or from another adapter. Destructure only the injectors you use, and write the registration key `as const`.
- **Do not register an `adapt()` class in `lib/option.ts`.** It self-registers, and `plug(Class)` uses the class itself as the token. `option.ts` is now only for legacy constructor-style adapters and for widening the options type.
- `this.logger` is provided; never construct a `Logger` inside an `adapt()` class. Lifecycle work goes in `override async onInit()`.
- **`adapt()` is for singletons only.** A per-use value object stays a plain class you `new` at the call site. Ask whether there is exactly one per process that a service needs injected; if not, it is a plain class.
- **Legacy shape — recognise it, do not copy it.** Plain classes with `constructor(options: XOptions)`, registered in `lib/option.ts` as `options.x ? new XApi(options.x) : null` and injected with `use<T>()`, still work. Migrate one to `adapt()` only when you are already changing it.

Conventions that hold for both shapes:

- Route every remote call through one private `#api<T>(path, init?)` with `signal: AbortSignal.timeout(20_000)`.
- Paginate with `for (let page = 1; ; page += 1)` broken by `if (pageItems.length < 100) break;`.
- Resolve secrets as `process.env.X ?? options.x ?? deterministicGenerator(...)` **inside a function**, never at module scope.
- Extend a function by appending an optional trailing parameter with a default, never by changing arity.
- Parameters: up to three required primitives positional; optional flags in a trailing `{ … } = {}`; four or more parameters, or any two same-typed strings, in one named destructured object.
- Release locks in `finally`. Load heavy optional dependencies through a module-level memoized promise (`sharpLoad ??= import("sharp")`).

### Error Placement

- State-machine preconditions throw in `document.ts`; cross-document rules throw in `service.ts`; request-level policy belongs in `signal.ts` guards.
- Best-effort code returns a sentinel (`null`, `undefined`, `[0, 0]`, `{}`). There are no Result/Either wrappers.
- `try/catch` is rare and always converts an exception into a decision, never swallows one. Guards catch → `logger.warn` → `return false`; adapters catch → `logger.error` → `return null`; UI uses `try/finally` to reset a spinner. A bodyless `catch {}` is acceptable only with a one-line reason.
- Store actions do not `try/catch` — let the framework toast the `Err`. Client-side validation failure is `msg.error("<key>")` plus an early return, never a throw.

## Scalar Modeling (`**/*.constant.ts`)

- Define Akan models in `.constant.ts` files with `via` from `akanjs/constant`.
- Use `Int` for whole-number counts and quantities; use `Float` only for values that need decimals.
- Use `ID` for document references and prefer explicit structured fields over `Any` unless the content is genuinely flexible.
- For date defaults, prefer a function such as `default: () => dayjs()` so the value is created at runtime.
- Follow the established model layering pattern in this order: `Input`, `Object`, `Light<Model>`, full `<Model>`, and `<Model>Insight`. Write all five, and write `<Model>Insight` even when it is empty.
- Put display and predicate logic on the `Light<Model>` class rather than in a util module — see Module File Playbook.
- Defaults are a literal for scalars and a thunk for anything constructed. Arrays are `field([T])`; optional is the postfix `.optional()`.

### Scalar & Field Type Reference

- **Import from `akanjs/base`** (real classes/helpers, not globals): `Int`, `Float`, `ID`, `Any`, `Upload`, `enumOf`, and the `dayjs` factory. There is **no `JSON` scalar** — use `Any` for open/flexible payloads.
- **Use the JS globals directly (no import needed)**: `String`, `Boolean`, `Date`. They are monkey-patched to behave like scalars, so `field(String)` typechecks.
- **`Number` is not a valid field/body type.** `NumberConstructor` is intentionally not augmented, so `field(Number)` / `.body("x", Number)` fails to typecheck. Use `Int` or `Float` instead.
- Runtime resolution of every scalar (globals included) goes through `PrimitiveRegistry` by `refName` (`pkgs/akanjs/base/primitiveRegistry.ts`).

### Text Search Fields — the `text` role

- A field joins the full-text index by declaring one of five roles: `field(String, { text: "title" })`, and likewise
  `"desc"`, `"tag"`, `"thumb"`, `"filter"`. Nothing else opts a field in, and there is no per-model switch.
- Pick the role by what the value *is*, because `bm25` weights them positionally (`title` 10, `tag` 3, `desc` 1,
  `filter` 0): `title` is the one line a human scans for, `desc` is prose, `tag` is a keyword list, `filter` is a
  scoping value (status, owner, role) that must be matchable but must never outrank a real title hit.
- `thumb` is mirrored for rendering a hit and is **not** indexed — never expect it to match.
- **A `secret`, `hidden`, or `resolve()` field with `text` throws at class-build time**, not at query time. That is
  deliberate: the mirror is plaintext, so an indexed secret would leak through search. Do not work around it. The
  same throw covers a `text` field *underneath* one of those — a scalar's own field is reachable through its parent,
  so `f.secret(Noti)` where `Noti.label` carries a role is rejected at the parent, not silently indexed.
- The role works on a relation too (`image: field(File, { text: "thumb" })`) and on an array (`playing: field([String],
  { text: "tag" })`); an array of objects indexes by leaf key, including an array leaf (`works[*].tags`). A field
  inside a `Map` indexes nothing: there is no fixed path to extract it from.
- Declaring roles is all the wiring there is. Mirror rows are maintained by SQL triggers — not document hooks —
  because `updateOneByQuery` and friends fire no hooks, and most searchable-field mutations go through exactly that
  path.
- Search runs on sqlite/libsql only. `q.search()` against Postgres throws, loudly, rather than returning every row.
- `AKAN_SEARCH_ENABLED=0` switches the index off process-wide; unset means on. It never deletes mirror data, and
  re-enabling reconciles every ref. **Give every process the same value** — a process cannot drop triggers for models
  it does not mount, so a mixed fleet leaves stale triggers behind.
- The tokenizer is `AKAN_SEARCH_TOKENIZER` (or `database.search.tokenizer`, which wins), defaulting to
  `unicode61 remove_diacritics 2`. Changing it rebuilds the index from the mirror on the next boot — the model
  tables are never re-read — so it is a safe knob, unlike a `text` role change, which re-reads every row. The
  rebuild takes no cross-process claim, so a fleet restarted at once repeats it in every process; stagger the
  restart when the mirror is large.

### Image & File Fields

- **Do not declare `Upload` as a model field.** `Upload` is a signal-body-only primitive (see Service And Signal Conventions). Models reference the `File` model instead.
- Declare an image/file field as a relation to `File`: `image: field(File).optional()` for one, `images: field([File])` for many (see `libs/shared/lib/user/user.constant.ts`, `libs/shared/lib/banner/banner.constant.ts`).
- The store then auto-generates an `upload<Field>On<Model>(fileList)` action that calls the framework upload mutation and polls file status until it leaves `"uploading"` (`pkgs/akanjs/store/action.ts`).
- Storage is wired through the `StorageAdaptor` DI role (default `BlobStorage`, `pkgs/akanjs/service/predefinedAdaptor/storage.adaptor.ts`); the reference implementation is the `file` lib (`libs/shared/lib/file/*`). Do not hand-roll data-URL fallbacks.

### Cascade Remove — the `cascade` option

- A relation field removes what it points at with `field(File, { cascade: "remove" })`. It works on an array too
  (`images: field([File], { cascade: "remove" })`), and only on a relation: a primitive, an `ID`, and a scalar each
  fail the class build, because none of them names a document the framework could remove.
- **The cascade goes through the target's service, never its model.** That is what runs the target's `_postRemove`,
  which is where a module puts the side effect the removal has to carry — `FileService._postRemove` deletes the
  stored blob/object there. Reaching the model instead still empties the row, so nothing looks broken until the
  storage bill arrives.
- Target services resolve **lazily, at removal time**, so a cascade adds no boot-order edge between two services and
  a cascade cycle cannot fail the boot. They resolve *before* the parent is touched, so a model cascading into a
  module the app never mounted fails with nothing half-removed.
- **Nothing checks whether another document still references the same target.** `File` in particular is deduped by
  `origin`, so two parents can share one row; declaring `cascade` says the field owns its target exclusively, and
  that judgement is the declaring model's to make.
- Removal is soft (`removedAt`) but the storage delete a `_postRemove` performs is not — a cascade is not
  restorable. Weigh that before adding it to a model users can undelete.
- **Query-level removes fire no hooks and therefore no cascade.** `deleteManyByQuery` / `updateManyByQuery` stamp
  `removedAt` in one atomic UPDATE, so nothing downstream runs. Remove one document at a time when it cascades.

## Akan Page Routing (`apps/**/page/**`)

- `apps/<app>/page` may contain route modules only. Do not add helper logic or component-only files there.
- Route source files under `page/` must use `.tsx`. Do not add `logic.ts`, `.js`, or `.jsx` files under `page/`.
- Route pages use `_index.tsx`; layouts use `_layout.tsx`; per-route UI overrides use `_overrides.tsx`.
- Reserved `_*.tsx` route filenames are limited to `_index.tsx`, `_layout.tsx`, and `_overrides.tsx`; do not add files like `_Component.tsx` or `_helper.tsx`.
- Page filenames must not start with an uppercase letter. Move helper components like `Component.tsx` to app `ui`, `common`, or `lib` instead.
- Dynamic segments use `[id]`; route groups use directories like `(user)`, `(public)`, `(tab)`, or `(detail)`.
- Page modules should usually export `default`, `pageConfig`, `head`, `generateHead`, or `Loading`.
- `_overrides.tsx` is a logic-free UI-override manifest: imports plus a single `export default override({ Slot: AppComponent })` (from `akanjs/ui`), no `"use client"`. It re-skins framework `akanjs/ui` components for its route subtree; nested manifests merge over ancestors slot-by-slot (closest wins). See the UI Customization reference for the slot list.
- Prefer `export default function Page` or `export default async function Page` for page components.
- `libs/<lib>/page` follows the same rules and ships routes to apps that opt in with `syncPageLibs` in `akan.config.ts`: `true` takes every lib dep that has a `page` folder, an array takes the libs listed, `false` (the default) syncs nothing.
- `akan sync` links those routes into `apps/<app>/page/(libs)/(<lib>)` — once per basePath when the app declares subRoutes. The folder is generated and gitignored; edit the lib source, never the link.
- Both path segments are route groups, so a lib route mounts at its own path (`libs/shared/page/login/_index.tsx` serves `/login`). Two synced routes that resolve to the same pattern are a sync-time error.
- `export const pageConfig = { devOnly: true }` keeps a route out of `akan build` while it keeps serving under `akan start` and keeps being typechecked. On a `_layout.tsx` it excludes every route under that directory too. Write it as a literal `true`/`false` — the build reads it off the source without evaluating the module.
- Before changing route behavior, check `pkgs/akanjs/server/src/routeTree.tsx` and nearby routes for the expected pattern.

### Page Body Shape

```tsx
interface PageProps {
  params: { orgId: string };
}

export default async function Page({ params }: PageProps) {
  const { l } = usePage();
  getSelf({ unauthorize: "/signin" });
  const { orgId } = params;
  const [{ org }, { taskInitInOrg }] = await Promise.all([fetch.viewOrg(orgId), fetch.initTaskInOrg(orgId)]);
  return <Task.Zone.Card init={taskInitInOrg} prefix={`/org/${orgId}`} />;
}

export const pageConfig = { transition: "stack" } satisfies PageConfig;
```

- There is no `loader=` / `render=` page prop. Pages are `export default async function Page`.
- Declare `interface PageProps { params: {...}; searchParams?: {...} }` immediately above the default export.
- Body order: `usePage()`, auth, destructure params, fetch, return.
- Run independent fetches through `Promise.all`, even when there is only one.
- Gate auth at `_layout.tsx`; repeating `getSelf({ unauthorize: "/signin" })` in the page is fine and common.
- Keep `async` even when nothing is awaited — it marks a real server page.
- No `useState`, no `useEffect`, and no comments in page files.

## Akan Sync Conventions (`apps/**`, `libs/**`)

- `apps/<appName>` root may only contain these files: `akan.app.json`, `akan.config.ts`, `capacitor.config.ts`, `client.ts`, `main.ts`, `package.json`, `server.ts`, `tsconfig.json`.
- `apps/<appName>` root may only contain these folders: `.akan`, `android`, `common`, `env`, `ios`, `lib`, `page`, `plugin`, `private`, `public`, `script`, `srvkit`, `ui`, `webkit`.
- The `plugin/` facet holds Akan plugin declarations; files use the `<name>.plugin.ts` convention (e.g. `pushNotification.plugin.ts`) and are re-exported from the generated `plugin/index.ts` barrel.
- Do not add `apps/*/base`; place shared app utilities under `apps/*/common`.
- `apps/*/lib` and `libs/*/lib` root files are limited to generated/support files: `cnst.ts`, `db.ts`, `dict.ts`, `option.ts`, `sig.ts`, `srv.ts`, `st.ts`, `useClient.ts`, `useServer.ts`.
- Domain module folders are `lib/<model>` for database modules, `lib/_<service>` for service modules, and `lib/__scalar/<scalar>` for scalar modules.
- Database module UI files are limited to `<Model>.Template.tsx`, `<Model>.Unit.tsx`, `<Model>.Util.tsx`, `<Model>.View.tsx`, and `<Model>.Zone.tsx`.
- Service module UI files are limited to `<Service>.Util.tsx` and `<Service>.Zone.tsx`.
- Scalar module UI files are limited to `<Scalar>.Template.tsx` and `<Scalar>.Unit.tsx`.
- Module `*.test.ts`, `*.test.tsx`, `*.spec.ts`, and `*.spec.tsx` files are allowed.
- `ui/index.ts`, `webkit/index.ts`, `srvkit/index.ts`, `common/index.ts`, `plugin/index.ts`, and module `lib/**/index.ts` files are generated by scanSync; do not hand-edit or track them.
- Generated facet indexes export only 1-depth files/folders with `export * from "./name";`.
- `libs/<libName>` may hold a `page` folder of route modules; scanSync links it into every app that opts in with `syncPageLibs`, so `apps/*/page/**/(libs)` is generated and gitignored like `public/libs`.

## Layer Placement (`common/`, `webkit/`, `srvkit/`, `ui/`)

| Folder | Admission test | Naming |
|---|---|---|
| `common/` | pure, isomorphic, zero-dependency; may import only sibling `common/*` and `akanjs/base`. Cannot import `Err`, so keep throwing code out of it. | camelCase file, filename equals the single export |
| `webkit/` | touches `window` / `navigator` / Capacitor, or is a React hook | `use<Thing>.tsx` — `.tsx` even with no JSX |
| `srvkit/` | touches `node:*`, `Bun`, `process.env`, a secret, or a server SDK | camelCase file, PascalCase class |
| `ui/` | renders JSX and is not bound to one model | PascalCase component, camelCase sidecar (`swipeCard.util.ts`) |
| `plugin/` | build- or CLI-time `AkanPlugin` | `<name>.plugin.ts`, registered in `akan.config.ts` |

- Hooks return a named object of async closures, never a tuple.
- A layer-root `index.ts` is generated, but a `ui/<Folder>/index.tsx` that builds a namespace is hand-written source. The distinguishing test is that a generated barrel contains nothing but `export * from "./X";` lines.
- `ui/<Folder>/index_.tsx` (trailing underscore) is the `"use client"` + `lazy()` boundary, with a server-safe `index.tsx` beside it. Collapsing the pair into one file breaks RSC.

## Present In The Code — Do Not Imitate

Older files contain these. They are warts, not conventions: do not copy them forward, and prefer the newer neighbour
when two shapes disagree.

- `children: any` — newer files use `children: ReactNode`.
- Hard-coded API keys or secrets in source; they belong in `option.ts` or env.
- Large blocks of commented-out code left in place.
- Cross-store writes through a `RootStore` cast — it collides with the Bun SSR-bundler segfault.
- Stale `// TODO: Implement …` comments above implemented methods.
- `{cond && <X/>}` in JSX, hard-coded Korean bypassing `l()`, and `window.alert(...)` for user feedback.
- Bare `/* eslint-disable */` blocks — use `// biome-ignore lint/<rule>: <why>`.
- Raw palette grays such as `text-gray-400` instead of daisyUI semantic tokens.

## Secrets And Env Safety (`.env`, `infra/**`, `*secret*`, `*credential*`)

- Never print, summarize, commit, or expose real secret values, credentials, tokens, private keys, or `.env` contents.
- If env keys are needed for documentation, list only key names and example placeholders, not live values.
- Preserve the existing env/secret flow through root scripts such as `bun run downloadEnv`, `bun run uploadEnv`, `bun run downloadSecret`, and `bun run uploadSecret`.
- When editing infra env or secret scripts, keep Jenkins and deployment assumptions intact unless the task explicitly asks to change them.
- Treat generated env/secret artifacts as sensitive even when they are not named `.env`.

## Application Test Commands

- After changing application source code, test the app with `bun run akan start <appName>`.
- Test production build generation with `bun run akan build <appName>`.
- To test a built artifact locally, run it from the generated app directory with the required Akan runtime environment variables.

```bash
cd dist/apps/akan && USE_AKANJS_PKGS=true AKAN_PUBLIC_REPO_NAME=akanjs AKAN_PUBLIC_SERVE_DOMAIN="akanjs.com" AKAN_PUBLIC_APP_NAME=akan AKAN_PUBLIC_ENV=local AKAN_PUBLIC_OPERATION_MODE=local SERVER_MODE=federation AKAN_PUBLIC_BASE_PATHS=akanjs,soft,office bun main.js
```

- Adjust `<appName>`, `AKAN_PUBLIC_APP_NAME`, and `AKAN_PUBLIC_BASE_PATHS` to match the app being tested.

## Before You Finish

1. `bun run akan lint <appName>` — Tailwind class order, `Err`, `console`, `#private` scope, unused imports.
2. `bun run akan typecheck <appName>` — server/client boundary violations.
3. `bun run akan sync <appName>` if you added, renamed, or deleted any file.
4. Re-read the file you wrote against its section above.
5. Did you add a comment? Delete it unless it documents an external constraint or a security decision.
6. Did behavior or an invariant change? Update the module's `*.abstract.md`.
