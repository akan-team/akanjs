# Akan.js Monorepo — Agent Guide

This is the canonical, tool-neutral guide for coding agents (Claude Code, Codex, Cursor, and others)
working in this repository, and the only copy. Claude Code reads it through `CLAUDE.md` (`@AGENTS.md`)
and Cursor through `.cursor/rules/akan.mdc`, both of which are pointers holding no content of their own —
there is nothing to mirror a rule change into. The section between the `akan:agent` markers is generated
by `akan agent install`; edit anything outside the markers freely.

<!-- akan:agent:start -->
<!-- akan:agent:version 3.1.0-rc.4 -->

## Workspace

- Repo: akanjs
- Apps: akan, groupedroot, minimal
- Libraries: shared, util
- Packages: @akanjs/cli, @akanjs/devkit, @akanjs/native, akanjs, create-akan-workspace, use-agentic

## Repo Overview

- Akan.js is a full-stack TypeScript framework: write one line and deploy across web, app, server, database, and
  infrastructure. It abstracts the technical implementation so what remains is business code — minimal, fast, and
  type-safe everywhere at once.
- This is a Bun-first monorepo: `apps/<app>` (pages, domain code, UI, env files, `akan.config.ts`), `libs/*` (shared
  domain and utility libraries), `pkgs/akanjs/*` (framework, runtime, and tooling facets published through the single
  `akanjs` package — extend an existing facet before adding a framework-level pattern), and `infra/` (Helm,
  deployment templates, edge configs, Jenkins env/secret scripts).

## Change Scope

- Keep edits scoped to the requested task and the directly related files.
- Do not reformat unrelated files or rewrite nearby code just for style.
- Do not revert or overwrite unrelated user changes in a dirty working tree.
- Prefer established nearby patterns over introducing a new abstraction.
- Add new abstractions only when they remove real duplication or match an existing project pattern.

## Deep-Dive Guidelines

This file carries the rules. The reasoning, the measurements, and the per-feature edge cases live in guidelines
you fetch on demand — `get_guideline` with the name, or `akan guideline show <name>`. Fetch the relevant one
**before** a deep pass on that area; a section below that points at one is a summary, not the whole contract.

| name | covers |
|---|---|
| `ssrRule` | server-share targets, the `akan.ssr.*` warnings, the client-boundary playbook |
| `pageRule` | route files, the route chain, heads, root layouts in a CSR bundle, lib pages |
| `runtimeRule` | web surfaces, gateway vs solo, the dev server, logging, the image, native apps and a desktop server, database modes |
| `queryRule` | slices and hydration, filter methods, soft removal and the facade's writes, full-text search, cascade |
| `transportRule` | guards and writing one, deadlines, cache, rate limits, server-to-server calls, bytes, binary pubsub, verbs |
| `mcpRule` | MCP exposure, configuration, wire behaviour, OAuth, page prompts, MCP Apps |
| `agentRule` | the in-page agent: chat options, tools, forms, zones, slash commands, compaction |
| `fieldRule` | field types, `hidden` / `secret` / `visual`, immutable and `Date` fields, image and file fields |
| `cssRule` | the semantic token set, the color vocabulary lint enforces, lib-owned tokens |
| `componentRule` / `recipeRule` | `_overrides.tsx` slots and drop-in components / authoring and consuming recipes |
| `workspaceRecipes` | worked recipes (fields, injection and `adapt()`, slices, endpoints, internals, insights), the generated API |

Module structure and each module file have their own guide (`moduleOverview`, `modelConstant` … `modelZone`,
`scalarConstant`, `scalarDictionary`, `scalarModule`).

## Lint-Enforced Rules (These Break The Build)

`biome.json` extends `@akanjs/devkit/biome.base.json`, which scopes every grit plugin in `@akanjs/devkit/lint/`;
each plugin's header and diagnostic carry its full reasoning. Several rules produce output that looks wrong — do
not "fix" it back.

- **Never hand-order Tailwind classes** — `nursery/useSortedClasses` sorts them, `cn()` arguments included, and its
  output (`font-bold text-2xl text-foreground`) is correct.
- **Stay inside the color vocabulary**: no raw palette (`bg-blue-500`), arbitrary or interpolated color classes
  (`bg-[#3b82f6]`), daisyUI classes or slots (`btn-primary`, `bg-base-100`), or color literals in `style={{}}` —
  they render no CSS. Use semantic tokens (`bg-primary`, `text-foreground/70`); a legitimate fixed color takes
  `// biome-ignore lint/plugin: <reason>`. Slot replacements, SVG / `el.style` warnings, legal values: `cssRule`.
- **Never construct a raw `Error`.** Throw `new Err("<module>.error.<key>")` with the key registered as `[en, ko]` in
  the module dictionary's `.error({})` — imported from `"../dict"` on the server, from `"@libs/<lib>/client"` /
  `"@apps/<app>/client"` in UI. A `throw` is an error; a raw `Error` rejected, returned or stored loses the key and
  status too (a warning for now). Exempt: tests, `*.constant.ts`, a root `native/` folder (plugins throw
  `AkanNativeError`), and `common/**` / `env/**`, which have no legal `Err` import — keep throwing code out of them.
- **Never import a third-party package** from `page/**`, any barrel, a module logic file
  (`*.{constant,dictionary,document,service,signal,store}.ts`) or module component
  (`*.{Template,Unit,Util,View,Zone}.tsx`) — re-export it through a lib first (one-line shims in a lib's `common/`,
  `webkit/`, `ui/` are load-bearing). `*.signal.test.ts` / `*.service.test.ts` too, though they may import `node:*`
  and `bun:*`.
- **`#private` is banned in exactly `*.constant.ts`, `*.document.ts`, `*.service.ts`, `*.store.ts`** (by path, so it
  stays the house style everywhere else, `srvkit/` and `adapt()` classes included).
- **No `console.log` / `console.debug`** (only `assert`, `error`, `info`, `warn`; server code uses `this.logger` or
  `new Logger("ClassName")`), and **never `logger.log()` / `Logger.log()`** — it emits at `info` while reading like
  its own level; write `.info()`. The ladder is `trace verbose debug info warn error`.
- **No `//!` or `/*!` in browser-reachable code** (`ui/`, `webkit/`, `common/`, `page/**/*.tsx`, `*.constant.ts`,
  `*.store.ts`, module components) — Bun keeps both through minification. Use `// FIXME:`.
- **`{name}`, never `{{name}}`**, in a dictionary `.error()` / `.translate()` entry — only single braces interpolate.
- **Every endpoint and named slice names its guards** (warning) — a `query` / `mutation` / `pubsub` / `message`, a
  named slice's `init()`, or a `slice()` map without `root` that names none (or `guards: []`) answers every caller.
  Write `guards: [Public]` when anonymous access is the intent.
- **Never touch `document.cookie`, `localStorage` or `sessionStorage`** — a native shell's page keeps no cookies on
  iOS, macOS and Linux, and Web Storage throws during SSR. Use `getCookie` / `setCookie` / `removeCookie`,
  `storage`, `secretStorage` from `akanjs/client`. Browser APIs a WebView lacks (`navigator.share`, `serviceWorker`,
  `Notification`, `geolocation`, `vibrate`) live in a `webkit/` hook behind `isNativeApp()` (warning). Both in full:
  `runtimeRule`.
- **Never return a value from a store action** — actions dispatch through `st.do.*` as `void`; write state with
  `this.set({ ... })`. A bare `return;`, a nested callback's `return`, a getter, and a `static` helper are fine.
- **No `static` on an `XObject` or `LightX` class** — `via()` mixes in their prototypes only; use `XInput` (or a
  scalar), `X`, or `XInsight`.
- **Never redeclare a generated CRUD endpoint name** in `*.signal.ts`.
- **Never type a `*.Util.tsx` / `*.Zone.tsx` prop as a `cnst` model** — the server would hand a class instance to a
  client component; take `bannerId: string` and read the model from the store. Exempt: `cnst.<Enum>["value"]`, a
  `ClientInit` / `ClientView` / `ClientEdit` / `ModelsProps<…>` type argument, a function-typed prop, a `cnst` type
  that never leaves the file; `ModelProps<…>` and other indexed accesses stay flagged.
- **Never wrap a form setter in a pass-through arrow** — `(v) => st.do.setTypeOnTicket(v)` emits no
  `data-akan-action` and publishes no agent tool. A wrapper that transforms, adds a statement, or calls `writeOnX`
  is legal; publish it with an explicit `st.tool`.
- **No deep imports past a barrel**, except cross-module constants (`../map/map.constant`).
- **Never import across the client/server boundary** (`apps/**`, `libs/**`). Client files (`ui/`, `webkit/`,
  `page/`, `*.store.ts`, every `.tsx`) never import a `*.document|dictionary|service|signal.ts`, `srvkit/`, a
  package `server` entrypoint, or the `db` / `srv` / `sig` / `dict` / `option` / `useServer` barrels. Server files
  (those four suffixes, `srvkit/`) never import a `*.store.ts`, a module component, `ui/`, `webkit/`, a package
  `client` entrypoint, or the `st` / `store` / `useClient` barrels. `common/` and `*.constant.ts` obey both.
  `import type` is legal everywhere; a mixed value-and-type import is not.
- **Server-component discipline** on `page/**`, `*.Unit.tsx`, `*.View.tsx` (`no-import-client-functions`,
  `no-use-client-in-server`, `non-scalar-props-restricted`).
- **No async component under `ui/`** — React has no async client component. Await in the page, or hand an
  unawaited `fetch.*` field to a `Zone` / `<Load.Stream of={…}>`, and take the data as a prop. An async handler in a
  synchronous component and `lazy(async () => import(…))` are untouched.
- **Never call `fetch.init<Model><Suffix>` / `fetch.get<Model>Init<Suffix>` from a client file** (`"use client"` or
  `*.store.ts`) — it is the hydration snapshot. Load it in the page and pass `init` down; reload with
  `st.do.init<Model><Suffix>()`.
- `noArrayIndexKey` and `useExhaustiveDependencies` are **off** on purpose — `key={idx}` for embedded scalars and
  short dependency arrays are intentional.
- **Suppress a grit diagnostic as `lint/plugin`** (`// biome-ignore lint/plugin: <reason>`,
  `// biome-ignore-all lint/plugin: <reason>`); bare `plugin:` does nothing. `pkgs/` is out of scope.
- **`biome.json` is strict JSON** — a comment breaks config resolution without an error (Biome falls back to
  discovery and aborts on a nested config); rename it `biome.jsonc` to document a disabled rule.
- **`akan lint` prints up to 200 diagnostics** (`--max-diagnostics <n>`, `0` = all); Biome's own uncounted 20 reads
  as progress when the mix merely changed.

## Coding Style (`**/*.{ts,tsx}`)

- Run a large unit of work through a class instance; prefer class or `static` methods over unrelated top-level
  helpers, and keep a class file's functions and variables inside the class when they reasonably can be.
- `#private` over TypeScript `private`, except in the four lint-banned suffixes, which use `private`.
- `const` function expressions over `function` declarations, unless hoisting, overloads, generators, or a framework
  convention make `function` the better fit.
- One class per file, named after it (`RouteClientBuilder.ts`, not `buildRouteClient.ts`). Migrate callers off an
  exported function that only instantiates a class and calls one method.
- TypeScript filenames are camelCase, except React component and convention files.
- One-off `className` strings stay inline; extract a constant only when reused, conditionally composed, or too large
  to read in JSX.

### File Size And Duplication

- Keep files small (house median well under 50 lines); split a component before ~150 lines rather than adding
  section comments.
- Ship every scaffold file even when empty — `export class XInternal extends internal(srv.x, () => ({})) {}`, empty
  dictionary stages, the `// state` / `// action` markers. They mark where things go.
- Never add a sibling helper file inside `lib/<model>/`; helpers go to `common/`, `webkit/`, `srvkit/`, or `ui/`.
- Prefer duplication to premature abstraction at the leaf: near-identical sibling modules and per-vendor pages are
  copied with changed literals, not parameterised; share enums by import only.

### TypeScript Shape

- `interface` for object shapes, `type` only for unions and aliases.
- `interface <ComponentName>Props` sits directly above the component (no blank line), `className?: string` first,
  named for the component (`CardProps`), never the model; exported only when a sibling imports it.
- No non-null assertions — narrow with `?.`, an early return, or a type predicate
  (`.filter((id): id is string => !!id)`). Escape with `as unknown as T`, never `as any`.
- Never annotate a component's return type; annotate a helper only for a union, tuple, or type predicate.
- `as const` on every `enumOf(...)` array (even though `enumOf` infers its literals, so a typo already fails to
  compile), `via(Model, [...] as const, …)` Light tuple, and module-scope lookup map; never the `enum` keyword.
- Async functions carry no `Async` suffix.

### Test Code

- Bun's runner (`describe`, `expect`, `test` from `bun:test`); colocated `*.test.ts` / `*.spec.ts`; focused behavior
  tests of public contracts and edge cases. A placeholder `it` with a descriptive title is the floor; a
  security-relevant behaviour gets a real suite.
- Run `bun run akan test <pkg>` from the root, or `cd <pkg> && bun test --isolate`. Plain `bun test` shares one
  global object across files and fails dozens of tests from that pollution (`bunfig.toml` `[test] isolate` is not
  honored as of Bun 1.3); from the repo root it breaks subprocess stdio pipes.
- Signal tests split in two: `<model>.signal.spec.ts` holds fixtures on `sampleOf(cnst.XInput)` with explicit
  `Promise<cnst.X>` returns and **no assertions**; `<model>.signal.test.ts` holds `describe("<Model> Signal")`,
  describe-scope `let` fixtures, one `beforeAll`, story-ordered `it`s, negatives via
  `await expect(p).rejects.toThrow()`. Each `fetch.clone()` reports its own address (`198.18.x.y`), so an `ip` rate
  limit counts it apart: clone once per simulated user, signup included (`clone({ clientIp })` names one).
- **One suite per module file**: `<model>.<role>.test.ts` beside the file it covers — never topic splits
  (`chatMessage.trim.signal.test.ts`); add a `describe`. A suite spanning modules goes in `srvkit/`
  (`libs/shared/srvkit/guards.signal.test.ts`), never the `lib/` root; `akan sync` refuses all three shapes. Only
  `akan typecheck <app-or-lib>` typechecks tests (`bun:test` types included).
- Import `UserAgent` / `AdminAgent` from `lib/user/user.signal.spec.ts`, the one place agent types are re-typed.

## Comments

Do not narrate code. Do document the thing the code cannot say. Both halves are the rule.

- Never restate the identifier, the signature, or the control flow; prefer names and structure. No JSDoc, section
  banners, or "why/how" comments on ordinary logic.
- Density tracks the layer: pages carry none, product `lib/` and `ui/` stay under 1 %, `srvkit/` adapters and
  `guards.ts` (what would leak without each guard) carry what the external constraints require.
- Warranted for: a vendor or protocol quirk; an infrastructure constraint; a library gotcha; security reasoning; why
  an arbitrary-looking rule is correct; a math derivation; a domain field's business meaning; a state transition above
  a document chain method; why an obvious alternative was rejected.
- Markers: `TODO` (tracked unfinished work), `FIXME` (known broken), `XXX` (a hazard a reader must not miss), `//!`
  (disabled or must-fix — server, `srvkit/`, CLI only), `//?` (an aside), `//*` (a design note), and a deletion
  caution saying why removing a line would break something non-obvious.
- One short line each. Every suppression carries a reason (`// biome-ignore lint/<rule>: <why>`), never a bare
  disable block. Match the nearby density.

## TypeScript And Imports (`**/*.{ts,tsx}`)

- Bun and ESM per the root `tsconfig.json`. Path aliases across packages: `akanjs/*`, `@apps/*`, `@libs/*`,
  `@contract/*`, respecting the `/client` and `/server` entrypoints. Let Biome organize imports.
- Backend `.ts` namespaces the generated barrels — `import * as cnst from "../cnst"`, `* as db`, `* as srv` —
  with `import type * as srv` in services (keeps the runtime graph lazy) and a value import in signals.
- `.tsx` uses one flat named import from the package client path
  (`import { cnst, fetch, st, Ticket, usePage } from "@apps/<app>/client"`), never a relative `../` import.

## Formatting And Linting

- Biome formats and lints: `bun run akan lint <appName>` from the root; 2-space indent, 120 columns, double quotes.
  No broad formatting-only changes in unrelated files.

## Client / Server Boundaries (`apps/**`, `libs/**`, `pkgs/akanjs/**`)

- `"use client";` tops client component files. It is mechanical by role: `Template`, `Zone`, `Util` always carry it
  on line 1; `Unit`, `View` never do. `usePage()` is legal in server files.
- A `"use client"` file re-exports by name (`export { A, B } from "./x"`), never `export *` — the server knows a
  client module only by the names it spells out, so `akan start` / `akan build` stop on a star re-export.
- Keep page props serializable unless the route pattern clearly allows otherwise; be careful importing client-only
  code into pages and layouts. Preserve file roles (`.document.ts`, `.service.ts`, `.store.ts`, `.constant.ts`,
  `.client.ts`), and inspect nearby files before introducing a new boundary pattern.

## SSR First — Server Rendering Is The Default

Server-rendered JSX ships as HTML and costs nothing to hydrate; `"use client"` ships it twice (markup plus JS that
re-runs). **The default is server; the directive is a cost justified per component** by a React hook, a JSX event
handler, the store, a browser global, or a client-only package — never by markup, params, `l()` or mapping data.
`akan quality ssr` (`--format json`) prints each app's and lib's server share: **50% is the floor, and a falling
share is a regression** to justify in the PR or revert. A client package or an `index_.tsx` `lazy()` boundary
justifies the directive; a `fetch.*` inside `onClick` is not flagged, only mount-time loads.

Playbook (warning table, code, checklist: `ssrRule`): ① wrap the interaction and render `children` untouched;
② split compound components (`Tab` / `Tab.Menus` / `Tab.Menu` / `Tab.Panel`) — never one client file with a mode
`useState` and every panel inlined; ③ fetch in the route and pass `init` / `view` to a `Zone`, never a
`useEffect(…, [])` load; ④ a store-reading `Zone` holds no markup and delegates to a server `View`; ⑤ hand each
promise across — `const { xInitInY, xListInY } = fetch.initXInY(id)`, `xInitInY` to a `Zone`, `xListInY` to
`<Load.Stream>` (model instances, server-only) — and `await` only what the shell must contain; ⑥ named `ReactNode`
slots (`Layout.Navbar`); ⑦ derived display logic on `Light<Model>`; ⑧ `getSelf({ unauthorize: "/signin" })` in
`_layout.tsx` (an in-page redirect after I/O; `.config({ ssr: "block" })` for a 3xx); ⑨ CSS (`data-*` +
`group-data-[…]`, `<details>`) over client state for visibility; ⑩ heavy islands behind `index_.tsx` + `lazy()`.

## Runtime & Build Configuration

Declared in `akan.config.ts`, narrowed — never widened — by an env at boot; domain code reaches none of it
(`runtimeRule`).

- **`web: true | false | { csr: boolean }`** — `{ csr: false }` drops the CSR bundle native apps ship, `false` is
  API-only.
- **Route prefixes move together**: `new AkanApp({ prefix, websocketPrefix })` in `main.ts`, mirrored in
  `api: { … }` in `akan.config.ts` for a CSR shell or native bundle. Read them with `getApiPrefix()` /
  `getWsPrefix()` (`akanjs/base`); never write `/api` or `/ws`, never pass one as a prop.
- **`main.ts` imports `AkanApp` from `akanjs/server/akanApp`**, not the barrel.
- Give every log sink a floor (`Logger.addSink(sink, { minLevel })`), never log per delivered record in anything
  that delivers records, and tail with `akan logs <app>`.
- **`docker` is `string | { image, preRuns, postRuns, command }`**; the generated image installs only
  `ca-certificates` and `tzdata`.
- **Native apps are the `native` section** (iOS, Android, desktop). A desktop app's carried server listens on a
  loopback port any local program can call — guard it as a network server — and ships `private/` and its env
  readable on the user's computer; read runtime files from `AKAN_APP_DIR`.
- **`database: { modes: [...] }`** (`single`, `multiple`, `cluster`), chosen by `AKAN_DATABASE_MODE`; an app running
  in two modes avoids `q.raw`.

## React Components And Styling (`**/*.tsx`)

- `export const X = ({ … }: XProps) => { return (…); };` — `export default` only for pages, layouts, `lazy()`
  targets. No `React.FC`, `defaultProps`, `PropsWithChildren`; defaults in the destructuring, `children: ReactNode`.
- `cond ? <X/> : null`, never `{cond && <X/>}` (renders `"false"` in a `className`); early `return null` only for
  guard clauses.
- Never hand-roll loading, empty, or list states: `Load.Units` / `Load.View` / `Load.Edit` (`renderItem`,
  `renderList`, `renderView`, `renderEmpty`), `<Empty />`, `Model.New` / `Model.Edit` / `Model.SureToRemove`.
  Otherwise `<Load.Stream of={promise} fallback={…}>{(value) => …}</Load.Stream>` awaits one promise behind its own
  boundary (a resolved value renders in the shell).
- Avoid hooks. `useState` only for modal-open, tab, draft-input, and drag state, never server data; `useEffect` only
  for a genuine effect (subscribe-with-cleanup, one-shot init); `Tab` over a mode switch; zero `useState` in a
  `.Template.tsx`.
- Forms are store-driven: `value={xForm.field}`, `onChange={st.do.setFieldOnX}` **by reference** — that emits the
  `data-akan-action` / `data-akan-state` the in-page agent, E2E selectors and browser agents read. Always `Field.*`,
  never a bare `<input>` for a model field; nested rows use `st.do.writeOnX("payments.3.name", v)` and the generated
  `add<Field>OnX` / `sub<Field>OnX`. Never hand-write `data-akan-*`.
- Read with `st.use.*`, write with `st.do.*`; client components never call `fetch.*`.
- **Never persist form values yourself** — `Load.Edit`, `Model.EditModal` and `Model.New` save and recover the whole
  `<model>Form` per record or route and user (`draft={false}` off, `draft="<scope>"` to name it; secret and hidden
  values never saved; field `cache` / `cacheKey` props are deprecated no-ops — `modelStore`).
- Static class strings stay plain. `cn` (from `akanjs/client`) only for a conditional or to merge an incoming
  `className`, caller last: `cn("base", cond && "extra", className)` — the only combiner: no `clsx`, raw `twMerge`,
  or object syntax.
- Multi-slot components take named props (`wrapperClassName`), never a `classNames` object.
- Enum→class lookups: a module-scope `as const` map typed `{ [key in cnst.XStatus["value"]]: string }`, not
  `Record<...>`. Shared by a second module, the classes become a recipe variant in `ui/Recipe/`; only an enum→variant
  name map (`BadgeVariants["variant"]`) moves to `webkit/`.
- `<Link>` from `akanjs/ui` for internal navigation; `<a>` only for `mailto:` and external links. A `<Link>` handed
  an absolute URL (any scheme, any case) or a `//host` path passes it through untouched and opens it outside the app;
  only an app path gets the locale and basePath. `Href.isExternal(href)` from `akanjs/client` is that test.

## Naming And Language

- Component exports are role names (`Card`, `General`, `Preview`, `Admin`, `Remove`) — the namespace carries the
  model (`<Floor.Unit.Card>`, never `FloorCard`). `Util` exports are the endpoint verb minus the noun (`Serve`,
  `Refund`).
- Layer the verbs: the document chain method drops the model (`sign()`), the service keeps the bare verb, signal,
  store and dictionary re-add it (`signScContract`) — clear of generated CRUD, and `st.do.X` reads like `fetch.X`.
- Slice and filter names are prepositional (`inOrg`, `byStatuses`, `ofPortfolio`), never `getXInY` or `listX`.
- Handlers are `onX` props taking inline arrows, never an extracted `handleX`.
- Booleans `is*` / `has*` / `can*` / `show*` / `disable*`; counters `*Num`; indices `idx`; collections `*List` or
  plural; no `SCREAMING_SNAKE` — module-scope tables are camelCase + `as const`.
- Keep existing domain vocabulary and its typos — transliterated terms and misspellings in use are load-bearing, and
  renaming silently breaks callers that match on the name.
- Identifiers, type names, endpoint names, and log messages are **English**. Everything a user reads goes through
  `l("model.field")` or `l.trans({ en, ko })` — never a hard-coded JSX string, never `window.alert`.
- Dictionary entries are `[en, ko]` pairs, nearly every label with a `.desc([en, ko])` even when repetitive; English
  in Title Case, Korean the plain domain term, `.error()` Korean ending in `다.`.

## Domain Module Conventions (`apps/**/lib/**`, `libs/**/lib/**`)

A business concept is one `lib/` folder holding its logic files
(`<model>.constant|dictionary|document|service|signal|store.ts`) and components
(`<Model>.Template|Unit|View|Zone|Util.tsx`). `constant`, `dictionary` and
`signal` are shared contracts with no platform-specific dependency; persistence and queries live in `document`,
orchestration in `service`, client state in `store`; `Template` is forms, `Unit` list/card items, `View` details,
`Zone` page sections, `Util` domain UI helpers.

- **`<model>.constant.ts`** — `enumOf("camelName", [...] as const)` classes, then
  `XInput → XObject → LightX → X → XInsight`, one blank line apart, `XInsight` even when empty. **Display and
  predicate logic goes on `LightX`** (`isNew()`, `canWrite(user?)`), which server and client both hold, never a util
  module — the most commonly missed rule. Collection helpers are `static` on `X`; a non-obvious field gets a short
  trailing comment. `Date` fields are prototype accessors that a spread drops — copy with `new cnst.X().set(user)`
  (`fieldRule`).
- **`<model>.document.ts`** — `XFilter extends from(...)` → `X extends by(...)` → `XModel extends into(...)`,
  `sort: {}` always present. Chain methods validate → mutate → `return this`, never `save()` (the caller saves, so
  `org.removeUser(id).removeInvite(id).save()` composes), with a one-line transition comment above each. Atomic
  counters live on the Model class with the updater callback, returning `!!modifiedCount`; indexes and derived
  totals go in `static override _onSchema`. **Removal is always soft** and reads see live rows unless
  `{ withRemoved: true }`. `updateById` / `removeById` fire no hooks — a cascading or `_postRemove` model removes
  through `remove<Model>(id)`, and `pickAndWrite` writes through the save hooks (`queryRule`).
- **`<model>.service.ts`** — a few lines: load → chain → `return await ….save()` (keep the `return await`). Side
  effects go in `override async _preUpdate` / `_postCreate`; fire-and-forget is `void`-ed. Load every referenced
  document, then save, then notify. Return `null` / `false` for not allowed or not found; the signal decides
  whether that is an error.
- **`<model>.signal.ts`** — `XInternal` → `XSlice` → `XEndpoint`, all three even when empty; `exec` is a one-liner
  calling the service.
- **`<model>.store.ts`** — custom actions only for a toast, an optimistic update, or a multi-field write:
  `await fetch.X` → `this.setX(...)` → toast, or mutate the client model, `void fetch.*`, then commit.
  `this.pick(...)` when the value must exist, `this.get()` when it may not, `this.set({...})` to write; lists through
  the collection API (`xList.set(x).save()`), not spread. **Another store is reached through `this`**:
  `import type { RootStore } from "../st"` (type-only — `st.ts` imports every store), then
  `(this as unknown as RootStore).logout()` or `.set({ … })` / `.get()`; every store is mixed into one root at
  runtime, so the cast only names what `this` already is.
- **`<model>.dictionary.ts`** — empty stages still written:
  `.of() → .model() → .insight() → .query() → .sort() → .enum() → .slice() → .endpoint() → .error() → .translate()`;
  every `.arg()` named, framework `skip` / `limit` / `sort` included; `modelDictionary` / `scalarDictionary` /
  `serviceDictionary` by module kind.
- **`<module>.abstract.md`** — a title, one sentence naming what the module owns, a `## Rules` list of two to five
  invariants the code cannot show, an optional workflow chain (`draft -> signed -> active`). Never restate fields or
  types; update it when an invariant or workflow changes.

## Service And Signal Conventions (`*.{service,signal}.ts`, `server/**`)

- `serve(...)` services hold business operations. Signals hold contracts: `internal(...)` for init, interval, cron
  and queue jobs (retries, dead letter: `workspaceRecipes` Recipe 5), `slice(...)` for focused data views feeding
  stores and zones, `endpoint(...)` for queries and mutations. External APIs and infrastructure go through
  `srvkit/` adapters injected into services, never vendor clients in domain logic.

### Authorization

- **Every `slice()` takes an explicit `{ guards: {…} }` second argument, and `root:` is always `Admin`.**
  `guards: { cru: false }` (or per verb) takes a generated verb off HTTP; `mcp: { cru: false }` only keeps it off the
  agent shelf.
- **Every custom `mutation` / `query` / `message` names its own `guards: [...]`** — the slice map reaches only
  generated endpoints, and a `pubsub` / `message` without its own is unguarded. `Public` belongs on a slice `get:`;
  on a mutation only for an act that must work signed out (sign-up/in, token refresh, an OAuth route), which also
  declares a `rateLimit`. A guardless endpoint is warned at boot and never published to MCP, which also refuses a
  mutation guarded only by `Public`.
- Guards serve HTTP and websocket alike: read `context.get<T>("account")`, never `getHttpContext()` /
  `getWebSocketContext()`; keep them side-effect free and re-runnable. The acting user comes from `.with(Self)` /
  `.with(CurrentUserId)` / `.with(Me)` (never a client-supplied id) and the caller's address from `.with(Ip)`.
- Keep `static name = "User";` on guard classes — `fetch` serializes it and the API explorer filters on it. It looks
  dead, so comment it.
- **Every guard declares `static scope: GuardScope`, no default**: `"account"` reads only the caller (MCP listings
  evaluate it to hide entries), `"resource"` needs the call's arguments and fails closed without them. `SignedIn` /
  `Admin` / roles are `"account"`, every `Can<Verb><Model>` is `"resource"`; `Person` adds `static agents = false`.
- `Can<Verb><Model>` guards in `srvkit/guards.ts` fail closed and ship with the model's library (`transportRule`).
  Services re-check ownership behind a guard — two independent gates.

### Calls, Queries, Agents (summaries)

- **Wire (`transportRule`)**: a deadline is the endpoint's `{ timeout: <ms> }` (undeclared, the client quits at
  30 s; the handler is not cancelled); `{ cache }` only on a `query` with no internal argument; `{ rateLimit }` per
  endpoint, `option.setRateLimit` per app, `plug(RateLimit)` for a business key. `socketId` names a connection, not
  a caller. A device proves itself with a `MachineToken`. Server to server, `fetch.clone({ origin })` opens no socket
  without `connect: true`, retries through `retry`, and rethrows a remote `Err` as is — never wrapped or re-keyed.
- **Body types**: `.body()` / `.param()` take scalars, model refs, or `enumOf(...)`; `Int` / `Float`, never
  `Number` (`pkgs/akanjs/signal/endpointInfo.ts`); `Upload` only in a `fileUpload: true` mutation; bytes are
  `Binary`, never `Any`. A model or scalar argument is checked against the request schema on every transport: a
  wrong JSON type, a value outside its enum or a missing required field answers 400 with `data.name` naming the
  path (`data.items.2.price`); a defaulted field may be left out, an undeclared key is dropped, and a stored model's
  input keeps an absent field absent.
- **Reserved names**: generated CRUD (`create<Model>`, `update<Model>`, `remove<Model>`, …) exists for every model.
  The service layer reports a collision as a typecheck error, but a colliding signal name can pass sync, typecheck
  and build and fail at runtime — treat it as an error.
- **Queries (`queryRule`)**: the root slice takes `queryKey` + `args`, never a raw query. A slice `exec` returns a
  `query<Filter>(…)` descriptor (never a `list<Filter>` array) and is paged through `initX(…, { sort, page, limit })`.
  A projection is bare on the facade (`pickById(id, { secret: true })`), under `select` on a filter accessor — the
  only way to read a `field.secret`. More rows: `loadMoreOf<Model>()` / `hasMoreOf<Model>`, never
  `count > page * limit`. A filter's `remove*` / `update*` are hookless (no cascade). No value is `q.empty`, never
  `q.missing`.
- **Search**: `q.search(text, { prefix: true })` in a filter, at an AND position, over `text`-role fields; a search
  *slice* only on data safe to enumerate; blank input matches nothing — never a passthrough.
- **`cascade` names a direction; the wrong one loses data**: `removeRef` on the owner's relation, `removeWith` on
  the child's reference to its owner. A query-level removal runs no cascade.
- **MCP (`mcpRule`)**: `/mcp` publishes every guarded endpoint by default; `mcp: false` (or a `slice()` `mcp` map
  mirroring `guards`) is curation, not authorization. `guards: [Every, Person]` reserves an act for a person;
  `.with(AgentCall)` narrows an agent's call. Settings are `option.setMcp` in `lib/option.ts`; `JWT_SECRET` is
  required outside `local`. Never make a refusal message more helpful. Every entry needs a `.desc()`; publish a
  screen with `page().prompt(name, description)`.
- **In-page agent (`agentRule`)**: mount `<Agent.Chat />` once in a layout; it never executes tools and refuses
  every call until `option.setAgentAccess(<guard>)`; the LLM is `option.setLlm({ apiKey, model, host })`, never env.
  The surface is what components declare — `st.tool(…).exec(fn)` beside its control, `st.use` / `st.sel` /
  `st.ref` keys — never a store class. `st.use.x({ agent: false })` hides a key; its model's `hidden` / `secret` /
  `visual` fields are stripped at read. A tool value is capped at 20,000 characters. Route guidance is
  `<Agent.Guide instructions="…" />`; model-facing text is English.

### Injection And Adapters

- A field named `<refName>Service` / `<refName>Signal` resolves to that registration — the suffix is required
  (`pkgs/akanjs/service/injectInfo.ts`). In a service: `service<srv.XService>()` · `plug(AdapterClass)` /
  `plug(StorageAdaptorRole)` · `use<T>()` only for a legacy `option.ts` singleton · `env(...)` for config.
- `memory(...)` takes a scalar or model class (`memory(Map, { of: CallStateInput })`); never hand-encode JSON into a
  `String` memory.
- **A new adapter is an `adapt()` singleton in `srvkit/`**, injected with `plug(TheClass)`, key `as const`. Never
  register it in `lib/option.ts` (it self-registers); never construct a `Logger` in it (`this.logger` exists);
  lifecycle work in `override async onInit()`. A per-use value object is a plain class. Legacy
  `constructor(options)` adapters migrate only when already being changed. Example and adapter conventions (one
  `#api<T>` with a timeout, pagination, secrets, parameter shapes): `workspaceRecipes` Recipe 2.

### Error Placement

- State-machine preconditions throw in `document.ts`, cross-document rules in `service.ts`, request policy in
  `signal.ts` guards. Best-effort code returns a sentinel (`null`, `undefined`, `[0, 0]`, `{}`) — no Result types.
- An endpoint names the errors it throws on purpose — `errors: { 409: ["ticket.error.locked"] }` in its signal
  option, with keys its dictionary defines and never `base.error.*`. That is the status's OpenAPI response and a line
  of the MCP tool's description; outside production a thrown key it leaves out warns once. A caller narrows with
  `Err.is(error, "ticket.error.locked")`.
- `try/catch` turns an exception into a decision: guards → `logger.warn` → `false`; adapters → `logger.error` →
  `null`; UI `try/finally` resets a spinner. A bodyless `catch {}` needs a one-line reason.
- Store actions do not `try/catch` (the framework toasts the `Err`); client validation is `msg.error("<key>")` plus
  an early return, never a throw.

## Scalar Modeling (`**/*.constant.ts`)

- Models use `via` from `akanjs/constant`, all five layers (`Input`, `Object`, `Light<Model>`, `<Model>`,
  `<Model>Insight`). `Int` for counts, `Float` only for decimals, `ID` for references; structured fields over `Any`.
- Import `Int`, `Float`, `ID`, `Any`, `Binary`, `Upload`, `ImageResult`, `enumOf`, `dayjs` from `akanjs/base`;
  `String` / `Boolean` / `Date` are globals. No `JSON` scalar (use `Any`), no `Number`, and `Binary` / `Upload` are
  never fields — a file is `field(File).optional()` / `field([File])`, uploaded by the generated
  `upload<Field>On<Model>`.
- Defaults: a literal for scalars, a thunk for anything constructed (`default: () => dayjs()`). Arrays
  `field([T])`; optional `.optional()`.
- **`field.hidden` / `field.secret` read `null` on the client while the type declares them** — guard with `??` or
  `== null`, never `=== undefined` or a default. `field.visual(T)` is rendered but stripped from every agent and MCP
  read. Full contract: `fieldRule`.

## Akan Page Routing (`apps/**/page/**`)

Full contract — heads, CSR root layouts, typed params, lib pages, `devOnly`: `pageRule`.

- `page/` holds `.tsx` route modules only: `<routeName>.tsx` or `_index.tsx`, `_layout.tsx`, `_overrides.tsx` — no
  other `_*.tsx`, helpers, `.ts` / `.js` files, or uppercase filenames. `[id]` is a dynamic segment, `(group)` a
  route group.
- **A route file exports one chain** — `page()`, `layout()` in a `_layout.tsx`, `rootLayout()` in a root
  `_layout.tsx` — and every setting is a stage (`.param`, `.search`, `.config`, `.head`, `.loading`; `.notFound` /
  `.error` on layouts; `.fonts` / `.theme` / `.manifest` / … on the root; `.prompt` on a page). A named export
  beside it fails the build.
- **Name every `[x]` segment with `.param("x", Type)`** and read query keys only via `.search("k", Type)`; values
  arrive typed. `lang` is never declared — every stage receives it.
- `.head()` takes JSX or a function returning it — never a metadata object; deeper heads replace by tag identity,
  and a canonical link / `og:url` comes only from the page's own `.head()`.
- In a CSR bundle a root layout's own markup is hidden: what a person must see from it renders through
  `createPortal(…, document.body)`.
- `_overrides.tsx` is one `export default override({ Slot: AppComponent })` (`akanjs/ui`), no logic, no
  `"use client"`. The legacy `export default async function Page` shape is never written anew.
- `libs/<lib>/page` reaches an app through `syncPageLibs`, linked into the generated `page/(libs)/(<lib>)`; edit the
  lib source, never the link. `.config({ devOnly: true })` (a literal) keeps a route out of `akan build`.

```tsx
export default page()
  .param("orgId", ID)
  .config({ transition: "stack" })
  .render(({ orgId }) => {
    const { l } = usePage();
    getSelf({ unauthorize: "/signin" });
    const { taskInitInOrg } = fetch.initTaskInOrg(orgId);
    return <Task.Zone.Card init={taskInitInOrg} prefix={`/org/${orgId}`} />;
  });
```

- `.render()` gets the declared args flat and typed (no `PageProps`, no `loader=` prop). Order: `usePage()`, auth,
  fetch, return. Hand `fetch.init*` / `view*` / `edit*` fields to sections unawaited; await only what the shell reads
  (title, redirect, link id) in one `Promise.all`.
- Gate auth at `_layout.tsx` (repeating `getSelf` in the page is fine). `async` only when the body awaits; the
  callback is not a React component, so it takes no name and no return type. No `useState`, `useEffect`, or
  comments in page files.

## Akan Sync Conventions (`apps/**`, `libs/**`)

- App root files: `AGENTS.md`, `CLAUDE.md`, `akan.app.json`, `akan.config.ts`, `client.ts`, `main.ts`,
  `package.json`, `server.ts`, `tsconfig.json`, `tsconfig.tsbuildinfo`; folders: `.akan`, `common`, `env`, `lib`,
  `native`, `page`, `plugin`, `private`, `public`, `script`, `secrets`, `srvkit`, `ui`, `webkit`. A Capacitor-era
  `ios` / `android` / `mobile` folder or `capacitor.config.*` in an app root is refused as a leftover (native
  projects live under `dist/native/<app>/<target>`).
- Lib root files: `AGENTS.md`, `CLAUDE.md`, `README.md`, `akan.config.ts`, `akan.lib.json`, `client.ts`, `index.ts`,
  `package.json`, `server.ts`, `tsconfig.json`, `tsconfig.spec.json`, `tsconfig.tsbuildinfo`; folders: the app's
  minus `.akan`, `script`, `secrets` (no `main.ts` either — a lib is never booted).
- The allowlists' one source is `pkgs/@akanjs/devkit/workspaceLayout.ts`, read by `akan sync` (error), `akan doctor`
  and `akan quality scan` — add an entry there and mirror it here.
- `apps/<app>/AGENTS.md` / `libs/<lib>/AGENTS.md` carry a generated `## Recipes In Scope` block between the
  `akan:agent` markers — never hand-edit it (outside the markers is yours); `akan lint` fails when it is stale.
- `plugin/<name>.plugin.ts` declares an Akan plugin. No `apps/*/base` or `libs/*/base` — use `common/`.
- `lib/` root holds only `cnst.ts`, `db.ts`, `dict.ts`, `option.ts`, `sig.ts`, `srv.ts`, `st.ts`, `useClient.ts`,
  `useServer.ts` — no hand-written file or test.
- Modules are `lib/<model>`, `lib/_<service>`, `lib/__scalar/<scalar>`; their UI files are
  `<Model>.Template|Unit|Util|View|Zone.tsx`, `<Service>.Util|Zone.tsx`, `<Scalar>.Template|Unit.tsx`. A test is
  named after the one file it covers, so `<model>.<topic>.signal.test.ts` is refused like `<model>.<topic>.signal.ts`.
- `ui/`, `webkit/`, `srvkit/`, `common/`, `plugin/` and module `index.ts` barrels are generated
  (`export * from "./name";` per 1-depth entry, `export {};` when empty, so a stale one heals on sync;
  `akan create-library` starts `common/`, `srvkit/`, `webkit/`, `ui/` with that empty barrel) — never hand-edit or
  track them. **Never hand-write an
  `index.tsx` / `.jsx` / `.mts` at those roots**: Bun resolves it before the generated `index.ts`, so new exports are
  `undefined` at runtime (`akan sync` refuses it, `akan doctor` reports `facet-index-shadowed`); a namespace belongs
  in `ui/<Folder>/index.tsx`.
- Sync writes barrels, module indexes and `akan.*.json` exactly as Biome prints them (`akan lint --no-fix` passes
  right after a sync), so a lint diff in one is a generator bug — fix the generator.
- **`akan sync` owns package.json `dependencies`**: it adds imports at the root's version, realigns root-declared
  entries, and drops unimported ones (logged); undeclared-at-root entries are kept with a warning. Keep a package no
  TS file imports (a CSS `@plugin`, a runtime-only package) with `akan.keepDependencies`; `externalLibs` and
  `trustedDependencies` always stay; devDependencies are realigned, never pruned. `akan install-library` lets the
  root win — it adds only what the root lacks and warns when the lib wants a newer version.

## Layer Placement (`common/`, `webkit/`, `srvkit/`, `ui/`)

| Folder | Admission test | Naming |
|---|---|---|
| `common/` | pure, isomorphic, zero-dependency; imports only sibling `common/*` and `akanjs/base` (so no `Err`, and no throwing code) | camelCase file named after its single export |
| `webkit/` | touches `window` / `navigator` / the native bridge (`akanjs/client/native[/<plugin id>]`), or is a React hook | `use<Thing>.tsx`, `.tsx` even without JSX |
| `srvkit/` | touches `node:*`, `Bun`, `process.env`, a secret, or a server SDK | camelCase file, PascalCase class |
| `ui/` | renders JSX or defines a look (`Recipe/`, a lib's `tokens.css`), not bound to one model | PascalCase component, camelCase sidecar, `Recipe/<name>.ts` |
| `plugin/` | a build- or CLI-time `AkanPlugin` | `<name>.plugin.ts`, registered in `akan.config.ts` |
| `native/` | a native plugin the app or lib owns — its page API reached only through a `webkit/` hook (`runtimeRule`) | `native/<id>/` |

- Hooks return a named object of async closures, never a tuple.
- Recipes live in `ui/`: `webkit/` hooks are `"use client"`, and `common/` cannot import `akanjs/ui`.
- A layer-root `index.ts` is generated; a `ui/<Folder>/index.tsx` building a namespace is hand-written (a generated
  barrel holds only `export *` lines). `ui/<Folder>/index_.tsx` is the `"use client"` + `lazy()` boundary beside a
  server-safe `index.tsx` — merging the pair breaks RSC.

## Present In The Code — Do Not Imitate

Warts in older files — never copy them; when two shapes disagree, follow the newer neighbour: `children: any`
(use `ReactNode`); hard-coded API keys or secrets (they belong in `option.ts` or env); large commented-out blocks;
stale `// TODO: Implement …` above implemented methods; `{cond && <X/>}`, hard-coded Korean bypassing `l()`,
`window.alert(...)`; bare `/* eslint-disable */` blocks; raw palette grays like `text-gray-400`. A store reaching
another through `(this as unknown as RootStore)` is **not** a wart — it is the sanctioned way.

## Secrets And Env Safety (`.env`, `infra/**`, `*secret*`, `*credential*`)

- Never print, summarize, commit, or expose real secret values, credentials, tokens, private keys, or `.env`
  contents; document env keys by name with placeholders only.
- Preserve the env/secret flow through `bun run downloadEnv`, `uploadEnv`, `downloadSecret`, `uploadSecret`, and
  keep Jenkins and deployment assumptions intact unless the task asks otherwise.
- Treat generated env/secret artifacts as sensitive even when they are not named `.env`.

## Application Test Commands

- After changing application code, run `bun run akan start <appName>` (`a,b`, `a b`, or `all` for several); check
  the production build with `bun run akan build <appName>`.
- A supervised session writes `local/apps/<app>/runtime/dev.log` (previous: `dev.prev.log`) — hand over that path,
  not a paste of the repainting full-screen view. Keys, `--plain`, boot waves, `--kill`, watch scope, running a
  built artifact, booting a server in a test: `runtimeRule`.

## Akan Module Abstracts

- Before changing a domain, service, or scalar module, read its `*.abstract.md` file first.
- Update the abstract when business invariants, workflows, or public behavior change.
- Do not update the abstract for formatting-only, import-only, or style-only changes.
- Service modules live in `lib/_<service>`, but their abstract file is `<service>.abstract.md`.
- Keep an abstract short — the invariants the code cannot show, and nothing it already states. `akan quality scan` warns past 300 lines.

## Generated Files

Do not hand-edit generated Akan files such as `apps/*/client.ts`, `apps/*/server.ts`, `*/lib/cnst.ts`, `*/lib/db.ts`, `*/lib/dict.ts`, `*/lib/sig.ts`, `*/lib/srv.ts`, `*/lib/st.ts`, `*/lib/useClient.ts`, `*/lib/useServer.ts`, `*/lib/**/index.ts`, `*/ui/index.ts`, `*/webkit/index.ts`, `*/srvkit/index.ts`, `*/common/index.ts`.
If generated output is stale or broken, update the owning source file and run `akan repair generated` or `akan sync <app-or-lib>`.

## Recipes

Framework UI recipes (Tailwind-variant look factories), importable from every app and lib: `import { <name> } from
"akanjs/ui"`, then `<name>(variants?, className?)`. The second arg merges internally and takes **an array too**, so
never wrap it in `cn()`: `<name>({}, ["h-full", isWide && "w-full", className])`. The list below is the full
contract (`*` marks the default, `key?` is a boolean flag) — do not guess a name, path, or variant value, and do
not open the recipe file to consume one. **Before inlining a repeated surface (card, box, tile, …): reuse a recipe,
or add one as `apps/<app>/ui/Recipe/<name>.ts`, one per file, re-exported from that folder's `index.ts` — never
re-implement the same look inline in several places, and never author a near-duplicate.** Full policy: the
`recipeRule` guideline.

Import from `akanjs/ui`:
- `badgeRecipe`(variant: default*|primary|secondary|accent|neutral|success|warning|info|error|outline · size: xs|sm|md*|lg · outline?) — 뱃지 look — 시맨틱 variant × size, outline 플래그는 색을 유지한 외곽선 스타일. `<Badge>` 가 소비하며, recipes.badge 슬롯으로 교체 가능.
- `buttonRecipe`(variant: default|primary*|secondary|accent|neutral|outline|ghost|destructive|success|warning|info|link · size: xs|sm|md*|lg|xl|icon · shape: default*|square|circle · outline?) — 버튼 look — 시맨틱 variant × size × shape, outline 플래그는 색을 유지한 외곽선 스타일. `<Button>` 이 소비하며, `_overrides.tsx` 의 recipes.button 슬롯으로 교체 가능.
- `inputRecipe`(kind: field*|area|select · size: xs|sm|md*|lg|xl · tone: default*|primary|error) — 입력 표면 look — Input/TextArea/DatePicker 가 공유하는 필드 셸. kind 로 한 줄 필드(field)/멀티라인(area)/네이티브 `<select>`(select), tone 으로 강조/오류 상태를 고른다.

App and lib recipes are **not** listed here. Each app/lib carries its own generated index —
`apps/<app>/AGENTS.md` / `libs/<lib>/AGENTS.md` (`## Recipes In Scope`) — regenerated by `akan sync` and
verified by `akan lint`. When working inside an app or lib, consult that file before consuming or authoring a look.

## MCP Workflow Policy

- **Prefer an Akan workflow to a direct source edit.** A direct edit is denied when an allowlisted workflow or repair tool can make the change.
- Inspect with `akan mcp --mode plan` (`list_workflows`, `explain_workflow`, `plan_workflow`); apply with `akan mcp --mode apply`, which allowlists `apply_workflow`, `run_validation`, and three of the five repair tools — `repair_generated`, `repair_imports` and `repair_module_shape`. `akan repair format` and `akan repair dictionary` are CLI-only.
- If `plan_workflow` returns `planPath` or `next.tool=apply_workflow`, call `apply_workflow({ planPath })` before editing source. Then run `run_validation` with `validationTarget` when present, otherwise `applyReportPath`.
- Split a compound request into workflows and apply each `planPath` in order, such as `create-module` followed by `add-field`.
- When no workflow exists, or apply reports unsupported/no-op/failed diagnostics needing manual action, keep edits scoped to owning source files and never patch generated files directly.
- **MCP not connected?** The CLI is a first-class equivalent — `akan workflow list` / `explain` / `plan` / `apply`, `akan doctor`, `akan repair`. See the onboarding guide's CLI-only fallback for the exact flags.

## Validation

- `akan sync <app-or-lib>`
- `akan lint <app-or-lib-or-pkg>`
- `akan typecheck <app-or-lib>`
- `akan test <app-or-lib-or-pkg>`
- `akan build <app-name>`
- `akan doctor --strict --format json`
- `akan quality scan [--format json]`
- `akan quality ssr [--format json]`

## Framework Guide

# Akan.js Framework Guide

## Ownership
- `pkgs/akanjs` facets include base, constant, document, service, signal, store, client, ui, and CLI tooling.
- Domain behavior lives near the model folder instead of being split by technical layer first.

## Current Akan Patterns
- Database module flow is `constant -> dictionary -> document -> service -> signal -> store -> UI`.
- Scalars (`lib/__scalar/<scalarName>`) represent embedded value objects; service modules (`lib/_<serviceName>`) hold
  behavior not centered on one stored model.
- Pages and components should consume generated client/server helpers rather than duplicating model shapes.

## Codegen Rules
- Prefer the most specific guideline for file syntax; use this guide only for global architecture context.
- When generating a new feature, start with the smallest necessary layer set and add later layers only when required by behavior.
- Keep business decisions in constant, document, or service; keep API exposure in signal; keep client coordination in store; keep rendering in UI files.
- Use direct module imports where scanner rules expect them, and avoid inventing new top-level app folders.

## Theming And UI Customization
When a request implies a distinct look and feel, do not stop at colors — customize both the theme and, when needed, the components.

- **Theme (`apps/<app>/page/styles.css`).** The app imports Tailwind and `akanjs/ui/styles.css`, then overrides semantic token *values* per theme under `:root, [data-theme="dark"]` and `[data-theme="light"]` (`--background`, `--foreground`, `--primary`, `--muted`, `--border`, … each with a `-foreground` pair for text). The framework maps them to Tailwind color names, so `bg-primary` / `text-foreground` follow the `data-theme` attribute; corner rounding uses `--radius-box` / `--radius-field`. Fetch `get_guideline` with `cssRule` for the full token set before a deep theme pass.
- **Lib tokens (`libs/<lib>/ui/tokens.css`).** The one CSS file a lib owns: colors its own components pin that must **not** follow the theme — a vendor brand color, a fixed surface — declared once as plain `:root` custom properties and compiled automatically into every app whose pages reach the lib, ahead of the app's stylesheets, so nothing is imported by hand. Reference them as `bg-[var(--kakao)]`; never copy the block into each app. `@theme` extensions stay in the app stylesheet, because the color vocabulary is closed per stylesheet, and theme-following colors are the app's.
- **Components (`page/**/_overrides.tsx`).** When a default `akanjs/ui` component (Button, Modal, Table, Input, Select, …) is too restrictive for the design, re-skin it per route instead of forking, wrapping, or fighting it with utility classes. Write a drop-in replacement in `apps/<app>/ui/` typed against the slot contract (`AkanModalComponent`, or `AkanUiOverrides["<Slot>"]`), composing the framework's headless parts, then bind it in a `page/**/_overrides.tsx` manifest with a single `export default override({ Slot: BrandComponent })`. Overrides cascade down the route tree like layouts (closest ancestor wins). Fetch `get_guideline` with `componentRule` and read the `references/ui/customize` docs page for the slot list and patterns.

## Before You Finish

1. `bun run akan lint <appName>` — Tailwind class order, `Err`, `console`, `#private` scope, unused imports.
2. `bun run akan typecheck <appName>` — server/client boundary violations, and the tests and specs nothing imports.
3. `bun run akan sync <appName>` if you added, renamed, or deleted any file.
4. Did you write or change a `.tsx` file? `bun run akan quality ssr` — did the server share hold, and did you add
   a `"use client"` you cannot justify?
5. Re-read the file you wrote against its section above.
6. Did you add a comment? Delete it unless it documents an external constraint or a security decision.
7. Did behavior or an invariant change? Update the module's `*.abstract.md`.
<!-- akan:agent:end -->
