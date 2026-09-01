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

Enforced by `biome.json`, which extends `@akanjs/devkit/biome.base.json` — that file scopes every grit plugin in
`@akanjs/devkit/lint/` to the paths it applies to. Several rules produce output that looks wrong; do not "fix" it
back.

- **Never hand-order Tailwind classes.** `nursery/useSortedClasses` is an error and also sorts the string
  arguments to `cn()`. Sorter output such as `font-bold text-2xl text-foreground` or
  `border-foreground/5 border-t` is correct. Write the classes in any order, run the formatter, leave the result.
- **Stay inside the color vocabulary.** Vocabulary closure strips the raw Tailwind palette, so these render as
  no CSS and fail lint (`no-raw-palette-class.grit`, `no-arbitrary-color.grit`, `no-daisyui-legacy-class.grit`, `no-inline-color.grit`,
  `no-interpolated-arbitrary-class.grit`): raw palette classes (`bg-blue-500`), arbitrary color values
  (`bg-[#3b82f6]`), an arbitrary class built by interpolation, daisyUI legacy classes (`btn-primary`, `card-body`)
  and its dropped color slots (`bg-base-100`, `text-base-content`, `text-primary-content`, `bg-error` — use
  `background`/`muted`/`border`, `foreground`, `<color>-foreground`, `destructive`), and color literals in
  `style={{...}}`. Use semantic tokens (`bg-primary`, `text-foreground/70`). A legitimate
  fixed color (OS-chrome mockups, data-viz) takes a `// biome-ignore lint/plugin: <reason>` with the reason
  spelled out.
- **Never `throw new Error`.** Throw `new Err("<module>.error.<key>")` and register the key as `[en, ko]` in that
  module's dictionary `.error({})`. Import `Err` from `"../dict"` on the server and from `"@libs/<lib>/client"` or
  `"@apps/<app>/client"` in UI. `no-throw-raw-error.grit` exempts tests, `*.constant.ts`, `common/**`, and
  `env/**` — `common/` and `env/` have no legal `Err` import path, so keep throwing code out of them.
- **Never import a third-party package** from `page/**`, from any barrel, or from any
  `*.{constant,dictionary,document,service,signal,store}.ts` / `*.{Template,Unit,Util,View,Zone}.tsx`
  (`no-import-external-library.grit`). Re-export the symbol through a lib first. One-line re-export shims in a lib's
  `common/`, `webkit/`, or `ui/` exist for exactly this reason — they are load-bearing, not cruft. Do not delete
  them.
- **`#private` is banned in exactly four file suffixes:** `*.constant.ts`, `*.document.ts`, `*.service.ts`, and
  `*.store.ts` (`no-js-private-class-method.grit`). The rule is scoped by file path, not by class shape, so
  `#private` remains the house style everywhere under `srvkit/`, including `adapt()` adapter classes.
- **No `console.log` / `console.debug`.** Only `assert`, `error`, `info`, and `warn` are allowed. Server code uses
  the injected `this.logger.*` or `new Logger("ClassName")`.
- **Never write a `//!` marker in browser-reachable code** — `ui/`, `webkit/`, `common/`, `page/**/*.tsx`,
  `*.constant.ts`, `*.store.ts`, and the five module component suffixes (`no-bang-comment-in-client.grit`). Bun
  classifies `//!` and `/*!` as legal comments and keeps them through minification, so the note ships to every
  visitor. Use `// FIXME:` there; `//!` stays legal in server, `srvkit/`, and CLI files.
- **Never return a value from a store action** (`no-return-in-store-action.grit`). Every method of a `store(...)`
  class dispatches through `st.do.<action>()`, which is typed `void` / `Promise<void>`, so the value is
  unreachable — write it into state with `this.set({ ... })`. A bare `return;` guard, a `return` inside a nested
  callback, a getter, and a `static` helper are all still fine.
- **Never redeclare a generated CRUD endpoint name** in `*.signal.ts` (`no-redeclare-predefined-endpoint.grit`).
- **Never type a `*.Util.tsx` / `*.Zone.tsx` prop as a `cnst` model** (`no-model-type-in-util-zone.grit`). Those two
  roles are always client components, so a `cnst.Banner` / `cnst.LightBanner` prop is a class instance the server has
  to hand across the boundary; take `bannerId: string` and read the model from the store instead. **Only prop
  positions are read** — a `*Props` interface or type alias, and the inline object type on the component's own
  parameter — and only shapes that are actually an instance are flagged. Exempt: an indexed enum access
  (`cnst.<Enum>["value"]`, a string union), a `ClientInit` / `ClientView` / `ClientEdit` type argument (plain
  `GetStateObject<…>` data), a `ModelsProps<…>` type argument, a function-typed prop, and any `cnst` type that
  never leaves the file. `ModelProps<"setting", cnst.LightSetting>` and any other indexed access
  (`cnst.Banner["image"]` is a `File`) stay flagged.
- **Never wrap a form setter in a pass-through arrow** (`no-unpublished-form-setter.grit`).
  `onChange={(type) => st.do.setTypeOnTicket(type)}` runs identically to `onChange={st.do.setTypeOnTicket}`, but
  the arrow is a fresh anonymous closure, so the control emits no `data-akan-action` and publishes no agent tool
  for the field — a silent failure in two lines that read the same. A wrapper that transforms the value, adds a
  statement, or writes a nested path with `writeOnX` stays legal; publish that one with an explicit `st.tool`.
  Scoped to `{apps,libs}/**/*.tsx`, and a typed parameter is not matched, so it under-reports rather than
  misfiring.
- **No deep imports past a barrel** (`no-deep-internal-import.grit`). Cross-module constant references such as
  `../map/map.constant` are the sanctioned exception.
- **Never import across the client/server boundary.** Client files (`ui/`, `webkit/`, `page/`, `*.store.ts`, every
  `.tsx`) may not import a `*.document.ts` / `*.dictionary.ts` / `*.service.ts` / `*.signal.ts`, `srvkit/`, a
  package `server` entrypoint, or the `db` / `srv` / `sig` / `dict` / `option` / `useServer` barrels
  (`no-import-server-in-client.grit`). Server files (those four suffixes plus `srvkit/`) may not import a
  `*.store.ts`, a module component, `ui/`, `webkit/`, a package `client` entrypoint, or the `st` / `store` /
  `useClient` barrels (`no-import-client-in-server.grit`). Shared files — `common/` and `*.constant.ts` — are held
  to **both**, so they reach neither side. `import type` is erased before bundling and stays legal in every
  direction; a mixed value-and-type import is not exempt. Scoped to `apps/**` and `libs/**`: `pkgs/akanjs/**`
  implements the boundary and is where the two graphs legitimately meet.
- **Server-component discipline** is enforced on `page/**`, `*.Unit.tsx`, and `*.View.tsx`
  (`no-import-client-functions.grit`, `no-use-client-in-server.grit`, `non-scalar-props-restricted.grit`).
- **Never write an async component outside `page/`** (`no-async-component-in-ui.grit`, scoped to
  `{apps,libs}/**/ui/**/*.tsx`). React has no async client component, so a `ui/` component that awaits breaks as
  soon as a client parent renders it, and the load drops below the route, which could have started it before the
  first byte. Await in the page — or hand an unawaited `fetch.*` to a `Zone` as an `init` / `view` prop — and take
  the resolved data as a prop. A component is a PascalCase binding whose own initializer is `async`, so an async
  handler declared inside a synchronous component, an inline `onClick={async () => …}`, and
  `lazy(async () => import(…))` are all untouched.
- **Never call `fetch.init*` from a client file** (`no-init-fetch-in-client.grit`). `fetch.init<Model><Suffix>` and
  `fetch.get<Model>Init<Suffix>` compose the slice's list and insight queries into the hydration snapshot that
  `Load.Units` / `Load.View` seed the store from. From a route it resolves before the first byte; after hydration it
  is two extra round-trips for a shell the browser already painted, landing in a value nothing reads. Load it in the
  page and pass the result down as an `init` prop — or hand the unawaited promise across — and reload from the client
  through the generated `st.do.init<Model><Suffix>()`. The gate is the file: the real `"use client"` directive (the
  same text as a string literal or inside sample code is not one) plus `*.store.ts`, which is client-only by role and
  carries no directive. The name is matched by shape, since a lint rule cannot know which slices exist: the
  generated one always carries two capital-led segments (`init` + `Capitalize<refName>` + `Capitalize<suffix>`), so
  a hand-written `initPayment` is out and `initializeSomething` was never in. `view` / `edit` hydrate alike but are
  left unmatched — `edit<X>` is a plausible custom endpoint name.
- `noArrayIndexKey` and `useExhaustiveDependencies` are **off** on purpose: `key={idx}` for embedded scalars and
  short dependency arrays are intentional, not oversights.
- **A grit plugin diagnostic is suppressed as `lint/plugin`, not `plugin`** — `// biome-ignore lint/plugin: <reason>`
  for one line, `// biome-ignore-all lint/plugin: <reason>` for a file. The bare `// biome-ignore plugin:` form Biome's
  own category name suggests does nothing. Suppress a plugin only where the rule is genuinely wrong for the file, and
  say why: the module-convention plugins (`no-import-external-library`, `no-deep-internal-import`, the store/signal
  ones) apply to `apps/**` and `libs/**` only, so a plain package under `pkgs/` never needs the escape hatch.
- **`biome.json` is strict JSON — a comment in it breaks config resolution.** Biome does not report the parse
  error; it falls back to discovery and aborts on whatever nested config the walk finds. Rename the file to
  `biome.jsonc` to document a disabled rule; `akan lint` pins the config path either way, so it reports the parse
  error on the offending line.
- **`akan lint` prints up to 200 diagnostics** (`--max-diagnostics <n>`, `0` for no limit). Biome's own default is 20
  with no count, which reads as progress when the mix of findings merely changed.

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
- `lib/user/user.signal.spec.ts` is the one place agent types are re-exported and re-typed; import `UserAgent` / `AdminAgent` from there rather than from the owning lib directly.
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
  4. `//!` — disabled or must-fix code. **Server, `srvkit/`, and CLI files only.** Bun's bundler treats `//!`
     (and `/*!`) as a legal comment and keeps it through minification, so in browser-reachable code the note
     ships verbatim to every visitor. Use `// FIXME:` there instead; `no-bang-comment-in-client.grit` enforces it.
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
- Respect existing client/server entrypoints — `@libs/<lib>/client` / `@libs/<lib>/server` and `@apps/<app>/client` / `@apps/<app>/server`.
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

## SSR First — Server Rendering Is The Default

Akan is SSR-first. Every JSX element that renders on the server ships as HTML and costs nothing to hydrate;
every element behind `"use client"` ships twice — as markup and as bundled JS that must re-run in the browser.
The boundary is not about which file *may* be client, it is about **how little** ends up on the client side.

**The default is server. `"use client"` is a cost you justify per component, not a habit.** A component earns the
directive only by using a client-only capability: a React hook, a JSX event handler, the store (`st.use.*` /
`st.do.*`), a browser global, or a client-only third-party package. Rendering markup, reading a param, calling
`l()`, and mapping over data are all server work.

Measure before and after with `akan quality ssr` (`--format json` for tooling). It prints the server render share
per app and lib — server-rendered JSX elements over total — and the SSR warnings below. Treat **50% server share
as the floor** for an app or lib and a **falling share as a regression**: if a change moves markup to the client,
say why in the PR or move it back.

### What `akan quality ssr` Flags

| Rule | Means |
|---|---|
| `akan.ssr.unnecessary-use-client` | The directive is there but nothing in the file needs it. Delete it. |
| `akan.ssr.client-static-component` | A component in a client file renders real markup with zero client-only capability — pure server work sitting in the bundle. |
| `akan.ssr.client-static-markup` | A large subtree wraps one or two interactive touches. Split it: interaction stays client, markup goes server. |
| `akan.ssr.client-mount-load` | A `useEffect(…, [])` loads server data. The route can fetch it before the first byte. |
| `akan.ssr.module-missing-server-view` | A module renders only from `Template`/`Zone`/`Util` and has no `Unit`/`View` at all. |
| `akan.ssr.template-client-state` | A `Template` holds form state in `useState` instead of the store. |

A third-party client package or an `index_.tsx` `lazy()` boundary is a legitimate reason for the directive and is
not flagged. Interaction-driven `fetch.*` (a lookup inside `onClick`) is not flagged either — only mount-time loads
are, because those are the ones the server could have done.

### Server-Side Implementation Playbook

1. **Wrap the interaction, not the UI.** The smallest useful client component adds one behaviour and renders
   `children` untouched, so the markup inside never reaches the bundle.
2. **Split compound components so panels stay on the server.** `Tab` / `Tab.Menus` / `Tab.Menu` / `Tab.Panel` in
   `akanjs/ui` is the shape: only the provider and menu hold state, and `<Tab.Panel>` renders children as-is.
   Never one `"use client"` file with a mode `useState` and every panel body inlined.
3. **Sync state instead of fetching it.** The route calls `fetch.initXInY(...)` / `fetch.viewX(...)` and passes
   the result into a `Zone` as an `init` / `view` prop; `Load.Units` / `Load.View` hydrate the store from it.
   Never a `useEffect(…, [])` that fetches on mount.
4. **Push the boundary down to the leaf that needs it.** A store-reading `Zone` should hold zero markup and
   delegate to a server `View`.
5. **Hand the promise across, not the awaited value.** `ClientInit` / `ClientView` are `PromiseOrObject<T>`, so a
   route may pass an unawaited `fetch.initX(...)` and `Load.*` resolves it behind a skeleton.
6. **Use named `ReactNode` slots, not just `children`.** `Layout.Navbar` takes `title`, `back`, `left`, `right`,
   and `children`, so a client shell composes server content in five places instead of absorbing it.
7. **Let the server do the derived work.** Display and predicate logic belongs on `Light<Model>`; enum→class
   lookups belong in a module-scope `as const` map.
8. **Gate auth on the server.** `getSelf({ unauthorize: "/signin" })` in `_layout.tsx` redirects before any HTML
   is sent.
9. **Prefer CSS over client state for pure visibility.** A `data-*` attribute plus `group-data-[…]` variants, or
   `<details>`/`<summary>`, keeps both branches server-rendered.
10. **Keep the heavy island out of the first load.** A large client-only widget goes behind the
    `ui/<Folder>/index_.tsx` + `lazy()` pair. `usePage()` and `l()` work in server components, so translation
    never forces a boundary.

Full version with code, the `Tab` composition example, and a review checklist: `get_guideline` with `ssrRule`, or
`akan guideline show ssrRule`.

## Web Surfaces — Building And Serving Without SSR/CSR

An app serves three things: the API, the SSR/RSC web renderer, and the CSR single-file bundle. The API is always
on; the other two are declared in `akan.config.ts` as **`web: true | false | { csr: boolean }`** and can be
narrowed again per deployment.

```ts
const config: AppConfig = { web: { csr: false } }; // web without the mobile bundle
const config: AppConfig = { web: false }; // api only
```

- **`web: { csr: false }`** drops the CSR build phase and the `/__csr` + `?csr=true` routes. The CSR bundle is
  what the Capacitor mobile build ships, so a web-only deployment never needs it — and an app that declares a
  `mobile` section is refused, because `akan build-ios` copies `dist/apps/<app>/csr/<target>.html` into the
  native project.
- **`web: false`** is an API-only build: no base artifact, no pages or client bundles, no RSC worker
  entrypoint, and no `public/` in the image (the web router's catch-all is its only reader). Nothing under
  `page/` is served, including routes a lib contributed through `syncPageLibs`.
- **There is no CSR-without-SSR option, by type.** The CSR bundle inlines the stylesheet the SSR base artifact
  compiles, so it would ship an unstyled app — the object form therefore carries only `csr`, and SSR goes off
  only through the whole-surface `false`.
- **At runtime, `AKAN_SSR` and `AKAN_CSR` narrow further and never widen** — `false` or `0` turns one off, and
  `AKAN_SSR=false` takes CSR with it for the same reason the option has no such pair. A surface the build left
  out cannot be switched back on, and the boot log names what the process ended up serving. The generated
  Dockerfile writes the build's own answer as the image default.
- **A build with no web artifact boots the API instead of crashing.** `WebRouter.create` returns `null` when
  `.akan/artifact/base-artifact.json` is absent — an api-only build, or a workspace with no `page/` at all.
- `akan start` ignores `web` and keeps the whole dev surface: the incremental builder is also the file watcher,
  so switching it off would take server-code HMR with it. It warns once when the config and the dev server
  disagree.
- The saving is mostly the RSC worker, which is a **separate process per web-serving replica**. Measured on
  `apps/akan` at boot plus one render: 350MB across 3 processes with SSR on, 120MB across 2 with
  `AKAN_SSR=false`, and the built image goes 86MB → 6.2MB when the artifacts are left out of it too.
- **The generated image installs `ca-certificates` and `tzdata` and nothing else.** It used to carry the whole
  Chromium runtime, ffmpeg, `build-essential`, `python3` and `redis` in every app's image whether or not the app
  reached for any of them. An app that needs one declares it in `docker.preRuns` / `docker.postRuns`, which are
  emitted around the `bun install` — that is the migration for a `puppeteer` or `ffmpeg` app.

## The Process Model — Gateway And Solo

A container runs one process per replica, a gateway in front of them when there is more than one, and one RSC
worker per web-serving replica.

- **One traffic replica runs in the container's only process.** `AKAN_REPLICA=0,0,1` — the default, and what
  every environment in `infra/app/values` sets — means there is nothing to balance and nothing to fan pubsub out
  to, so `AkanApp` starts that replica in-process rather than spawning it. Measured on `apps/akan`: 28MB less RSS
  and twice the requests per second, because every request used to cross a unix-socket proxy hop. Declare two or
  more and the gateway is back, spawning and proxying them.
- **`AKAN_SOLO=false` forces the gateway** for a single replica. Like `AKAN_SSR`, the env only narrows — it
  cannot fold a real gateway's replicas into one process. Passing `replica` to `new AkanApp(...)` also keeps the
  gateway: code that states a topology is asking for the thing that serves it.
- **`akan start` always runs the gateway**, whatever the replica count. It is also the dev host's builder relay,
  its crash page, and what holds the port across a child restart.
- **A batch-only replica (`0,1,0`) keeps the gateway too**, because a batch server never listens and the gateway
  is then the only thing bound to answer `/_akan/app/health`.
- **The RSC worker is never folded in.** It runs under `--conditions react-server`, which resolves the same
  module graph differently, so it cannot share a process with the server that renders client components.
- **A solo process answers `/_akan/app/health`, `/_akan/app/metrics` and `/_akan/bench/ping` itself**, in the
  gateway's own shape — a `children` array with one entry — so a probe reads one contract either way. It owns the
  rotating log file the gateway would otherwise write, in the same `runtime/logs` directory.
- **Nothing supervises a solo process but the orchestrator**, since the gateway's crash-restart-with-backoff went
  with it. `infra/app/templates/app.yaml` carries the liveness, readiness and startup probes that replace it.
- **`main.ts` imports `AkanApp` from `akanjs/server/akanApp`, not the barrel.** The barrel re-exports
  `AkanServer`, whose graph the gateway never runs; through it the process evaluated 35MB of SSR renderer and
  SQLite driver to spawn children and relay bytes. Keep entrypoint imports at the leaf.

## The Generated Image — `docker` In `akan.config.ts`

**`docker` is `string | { image, preRuns, postRuns, command }`** — a whole Dockerfile, or the parts Akan
assembles one from. There is no `content` field; the string *is* the content.

```ts
const config: AppConfig = {
  docker: { preRuns: ["apt-get update && apt-get install -y --no-install-recommends ffmpeg"] },
};
const config: AppConfig = { docker: "FROM oven/bun:1-slim\n…" }; // verbatim, nothing merged in
```

- `image` and each run entry take `string | { amd64?, arm64? }`; the object form compiles to a
  `RUN if [ "$TARGETARCH" = "<arch>" ]` guard, so a multi-arch build runs it on one leg only. `preRuns` land
  before `bun install --production` (where a native dependency's build tools have to be), `postRuns` after it
  and before the app files are copied.
- **A lib declares the steps its own runtime needs**, and every app that mounts it inherits them:
  `libs/<lib>/akan.config.ts` takes `docker: { preRuns, postRuns }` and nothing else — the base image and the
  command belong to the app. Lib steps are emitted before the app's own, and an identical step declared twice
  becomes one layer.
- **The string form takes no contributions.** A Dockerfile handed over whole is used exactly as written, so a
  lib's `preRuns` are dropped rather than spliced into a file Akan does not own. An app that needs both writes
  the parts instead.
- Like `externalLibs`, lib steps are collected from **every lib in the workspace**, not just this app's
  dependency closure — narrowing that set needs the dependency scan, and this config is re-read on every file
  change in dev. Keep a lib's steps to what its runtime genuinely requires.
- `AkanAppConfig.docker` is the resolved declaration; `AkanAppConfig.dockerfile` is the text `akan build` writes
  to `dist/apps/<app>/Dockerfile`.

## React Components And Styling (`**/*.tsx`)

- Components are `export const X = ({ … }: XProps) => { return (…); };` — arrow const with a block body. `export default` is reserved for pages, layouts, and `lazy()` targets.
- Never `React.FC`, never `defaultProps`, never `PropsWithChildren`. Defaults go in the destructuring (`prefix = ""`); children are typed `children: ReactNode`.
- `"use client"` on line 1 above the imports is mechanical by file role: every `.Zone.tsx`, `.Template.tsx`, and `.Util.tsx` has it; no `.Unit.tsx` or `.View.tsx` ever does. `usePage()` is legal in server files.
- Conditional render is `cond ? <X/> : null`. Never `{cond && <X/>}` — in a `className` context it renders the literal string `"false"`. Early `return null` is for guard clauses only.
- Never hand-roll loading, empty, or list states. Use `Load.Units` / `Load.View` / `Load.Edit` with `renderItem`, `renderList`, `renderView`, and `renderEmpty`; `<Empty />` for a bare placeholder; and `Model.New` / `Model.Edit` / `Model.SureToRemove` for CRUD modals.
- Avoid hooks. `useState` is for modal-open, tab, draft-input, and drag state only — never for server data. `useEffect` must be a genuine effect such as subscribe-with-cleanup or one-shot init. Prefer `Tab` over a `useState` mode switch. `.Template.tsx` files contain zero `useState`.
- Forms are entirely store-driven: `value={xForm.field}` with `onChange={st.do.setFieldOnX}`, the setter passed by reference. Always use `Field.*`, never a bare `<input>` for a model field. Nested rows use `st.do.writeOnX("payments.3.name", v)` plus the generated `add<Field>OnX` / `sub<Field>OnX`. **Passing the setter by reference is also what makes the framework emit `data-akan-action` / `data-akan-state`** on the control — the annotation an in-page agent, an E2E selector, and an external browser agent all read. Wrapping it in an inline arrow (`onChange={(v) => st.do.setFieldOnX(v)}`) silently drops that: a closure the caller wrote says nothing about what it does. Never hand-write a `data-akan-*` attribute.
- Read with `st.use.*` and write with `st.do.*`. Client components do not call `fetch.*`.
- Static class strings stay plain strings. Reach for `cn` only for a conditional or to merge an incoming `className`, and merge the caller last: `cn("base classes", cond && "extra", className)`. `cn` comes from `akanjs/client` (token-aware tailwind-merge) and is the only class-combining function — no `clsx` (removed), no raw `twMerge` imports, no object syntax (`{ x: cond }` → `cond && "x"`).
- Multi-slot components take extra named props (`wrapperClassName`, `bodyClassName`), never a `classNames` object.
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
predicate logic on `LightX` (`isNew()`, `canWrite(user?)`, `formatTimes()`) — the Light class is the one both server
and client hold, so shared logic belongs there instead of in a util module. This is the most commonly missed rule in
the codebase. Collection-level helpers go `static` on the full model. Give any field whose business meaning is not
obvious a short trailing comment.

**`<model>.document.ts`** — fixed order: `XFilter extends from(...)` → `X extends by(...)` → `XModel extends into(...)`,
with `sort: {}` always present. Chain methods validate → mutate → `return this`, and never `save()`; the caller saves,
so chains compose (`org.removeUser(id).removeInvite(id).save()`). Put a one-line comment above each stating the
transition. Atomic counters live on the Model class with the updater-callback form, returning `!!modifiedCount`.
Indexes and derived totals go in `static override _onSchema`, not in the service. **Removal is always soft** — the
framework has no hard delete for a model table, and `delete` is deliberately left unused so it can mean one later.
The facade spells `Many`/`One` out on its writes (`updateOne` / `updateMany` / `removeOne` / `removeMany`), because a
bare `update`/`remove` would read like the document-path `update(id)` / `doc.remove()` while hitting every match; only
the count was shortened to `count(query)`, with `countDocuments` kept as `@deprecated`. `updateById(id, update)` and
`removeById(id)` are those same query-level writes narrowed to one id, **not** the document path: they fire no hooks,
so a model whose removal cascades or carries a `_postRemove` still goes through `remove<Model>(id)`.

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
through the collection API (`this.set({ xList: xList.set(x).save() })`), not array spread. **An action returns
nothing** (`no-return-in-store-action.grit`) — hand the result to `this.set({...})`; a bare `return;` guard stays
fine. **Never `import type { RootStore } from "../st"`** — it crashes `akan build` with a Bun SSR segfault.

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
- **Never read the caller's IP off the socket or the request peer — take `.with(Ip)`.** Whenever a federation
  gateway is in front, `ws.remoteAddress` and the child's own peer are the *gateway* (`127.0.0.1`) for every
  caller and for the whole life of every socket. `Ip` reads what a proxy recorded (`x-real-ip`, then the first
  `x-forwarded-for` entry) and falls back to the peer only when nothing proxied the call — which is the answer
  for a solo process behind an ingress that sets neither; `context.getClientIp()` is the same answer inside a
  guard or middleware. It arrives unwrapped from
  its `::ffff:` IPv4-mapped form, so it can address a `udp4` socket as well as identify a caller, and it is
  `null` rather than a placeholder when genuinely unknown — a loopback-looking address for an unknown caller
  is the failure this replaced. The gateway also forwards the client port (`x-forwarded-port`, read with
  `context.getClientPort()`) along with host and protocol.
- **Every socket carries a `socketId`, and only the framework mints one.** `AppWsData` assigns it at the handshake, and a `message` / `pubsub` handler reads it off the `Ws` internal arg — `.with(Ws)` hands `{ ws, socketId, subscribe, on, off }`. Never mint your own from `ws.data`: the room bookkeeping keys on the framework's id, and a second one fails to match it silently. It identifies a **connection**, not a caller — a reconnect gets a new id and the federation gateway's own socket is a different one — so per-user state keys on the account, never on this.

- **A cleanup registered with `ws.on("disconnect" | "unsubscribe", fn)` is scoped to the call that registered it.**
  From a `pubsub` subscribe it belongs to that room — `unsubscribe` runs when the client leaves it or a credential
  change revokes it, `disconnect` when the socket closes while still subscribed — so a room already left runs
  neither again, and cleanup that must happen either way registers for both. From a `message` handler it belongs to
  the socket and runs at close. A handler that throws is logged and never blocks the rest of the teardown.

### Authorization Defaults

- **Every `slice()` takes an explicit `{ guards: {…} }` second argument, and `root:` is always `Admin`.**
- **Every custom `mutation` / `query` / `message` names its own `guards: [...]` array.** Never rely on the slice default. `Public` belongs on a slice `get:`, never on a mutation.
- **The guards are also the MCP exposure decision** — see MCP Exposure. An endpoint that names none is not published to agents at all, and a mutation whose only guard is `Public` is refused, so a missing `guards` array now costs visibility as well as authorization.
- Resource guards are `Can<Verb><Model>` classes in `srvkit/guards.ts` that `implements Guard` with an `async canPass(context)`. They **fail closed**: no resource named ⇒ `false`; a load that throws ⇒ `logger.warn` then `false`. Admin bypass goes first.
- Keep `static name = "User";` on guard classes. `fetch` serializes guard names and the API explorer filters on them; it looks like dead code, and deleting it breaks the UI. Comment it so the next reader knows.
- **Every guard class also declares `static scope: GuardScope`, and it is required with no default.** `"account"` means the verdict reads the caller and nothing about the call, so it can be evaluated with no arguments — which is what lets an MCP listing hide what this caller certainly cannot use. `"resource"` means it needs the call's arguments (`context.getArg()`) and fails closed without them, so it is never evaluated for a listing: the entry stays visible and is stopped at call time. Getting it wrong is not a type error, so the marker is mandatory rather than defaulted — `SignedIn` / `Admin` / role checks are `"account"`, and every `Can<Verb><Model>` is `"resource"`.
- The acting user arrives via `.with(Self)` / `.with(CurrentUserId)` / `.with(Me)`. Never trust a client-supplied id.
- Guards ship with the library that owns the model and are imported by its own signals through the package path, so a mounting app inherits authorization and cannot forget it.
- Services re-check ownership even when a guard already gated the call — two independent gates.
- `srvkit/guards.ts` earns real comments: explain what would leak without each guard.

### Signal Body Types

- `.body(...)` / `.param(...)` args accept `ConstantFieldTypeInput` only: scalars, model refs, or `enumOf(...)`.
- Numbers must use `Int` or `Float` — `Number` is rejected (`pkgs/akanjs/signal/endpointInfo.ts`).
- `Upload` is valid only inside a mutation flagged for file upload: `mutation([cnst.File], { fileUpload: true }).body("files", [Upload])`, as the `file` module does. It is not a model field type.
- Bytes are `Binary`, never `Any` — see Scalar & Field Type Reference.

### Binary Pubsub

- **`pubsub(Binary)` sends its payload in a websocket binary frame**, skipping the JSON `{ type: "pub" }`
  envelope and the base64 a JSON wire would need. The client's subscribe callback receives a `Uint8Array`.
  Nothing else is declared: the return type is the whole switch, and text and binary frames coexist on one
  socket, so every JSON endpoint is untouched. The optimization applies only when the **whole** return is
  `Binary` — `[Binary]`, or a `Binary` inside a model, falls back to base64.
- **A declared `Binary` room coalesces under backpressure**: while a socket cannot keep up the room keeps only
  its newest frame and drops the rest, which is what a telemetry or video stream wants. Declare
  `pubsub(Binary, { backpressure: "queue" })` when the frames are a sequence a subscriber must see in full, such
  as deltas against a base it already holds; the send buffer then grows with the slowest subscriber. Coalescing
  is keyed by the endpoint, not carried with the frame, so this process, an IPC deliver and a Redis fan-out all
  reach the same answer. Coalesced frames are counted in `pubsubCoalesceCount` on the replica's metrics report.
- **A `pubsub(Any)` that happens to carry bytes is framed too, and warns once.** `Any` passes a `Buffer` through
  untouched, so the transport sees bytes and sends them whole rather than as a number array — an undeclared
  publisher is fixed rather than left corrupt. It is still not the contract: it queues rather than coalescing
  (nobody declared lossy delivery for that room), and a Redis fan-out still JSON-stringifies it. Declare
  `Binary`.
- The federation gateway relays a binary frame unchanged, and Bun IPC carries bytes as bytes, so the only hop
  that needed teaching was the socket itself. A cross-server (Redis) fan-out encodes it as protobuf `bytes`.

### Mutation HTTP Verb

- A `mutation` is `POST`. `{ method: "PATCH" | "PUT" | "DELETE" }` moves it, and one path may carry several verbs
  — a `query` GET and a `mutation` POST on the same custom `path` are mounted side by side. Two endpoints claiming
  the same path **and** verb fail the boot rather than silently shadowing one another.
- Reach for it only when a foreign wire protocol forces the verb (a client you cannot change that sends
  `PATCH /rest/v1/<table>`). Akan's own `fetch.*` client, the OpenAPI document, and the API explorer all follow
  whatever is declared, so nothing needs restating per caller.

### Reserved Endpoint Names

- Auto-generated CRUD endpoints (e.g. `create<Model>`, `update<Model>`, `remove<Model>`) already exist for every model. Do not declare an `Endpoint`/`Slice` with a name that collides with them.
- The service layer surfaces such a collision as a typecheck error, but the signal layer can pass sync/typecheck/build and fail only at runtime — so treat name collisions as errors regardless of whether the build is green.

### Slices, Queries, and Hydration

- **The root slice (`""`, generated by `slice()`) takes `queryKey` and `args`, not a query.** `initX("byOwner",
  [ownerId])` names one of the model's own filters and passes that filter's args; no key at all is the `any`
  filter every model carries. A raw query descriptor let a caller compose a query the model never declared, and
  could not survive the query string at all — `String(value)` sends `[object Object]`. Args are parsed by the type
  the filter declared, a missing required one is refused, and args past the declared ones are dropped
  (`resolveFilterQuery`, `pkgs/akanjs/document/filterMeta.ts`). It is an admin API: `root:` is always `Admin`.
- **Give an id filter arg a `ref` and the admin panel stops asking for hex.** `filter().arg("ownerId", ID, { ref:
  "user" })` names the model the id points at; the arg then renders a picker that runs the same query maker against
  that model's own filters, so a ref of a ref keeps nesting. The picker holds its rows in local state rather than the
  ref model's store — that store is a singleton, and loading into it would overwrite whatever listing of the same
  model is already on screen. `ref` is the only UI hint a filter arg carries; there is no render callback, because a
  function cannot cross to the client.
- **A summary counter names the listing it counts, on the field itself.** `field(Int).meta(getQueryMeta("user")
  .query("byStatuses").args([["prepare"]]))` is what makes the dashboard tile clickable: clicking it applies that
  filter to the listing in place — one request, no navigation — and fills the arg controls under the toolbar, so
  the filter is visible and editable rather than opaque. `args` may be a thunk (`() => [dayjs().subtract(1,
  "hour")]`), read at the click so a relative time is current. A meta naming a different model counts a different
  listing, so its tile stays inert here. `AdminPanel`'s `queryMap` still overrides per column, and is now only for
  a column whose field cannot declare one.
- **A picker row is labelled by `labelOf`, which reads `Light<Model>.label()` first.** Then the field carrying
  `text: "title"`, then `title` / `name`, with the id as the floor. Write the method on the Light class — that is
  where display logic belongs, and the same label is what `Load.Units` and the in-page agent's screen scope show.
  A model with none renders ids and says so in the picker.
- A slice's `exec` returns a `QueryOf` (an opaque query descriptor, `pkgs/akanjs/constant/types.ts`); you **cannot** chain `.sort()`/`.limit()` on it.
- Apply ordering/paging via the store `init` fetch option instead: `initX(..., { sort, page, limit })` (`pkgs/akanjs/fetch/fetchType/sliceFetch.type.ts`).
- Generated list accessors like `listBy(...)` return `Promise<Doc[]>`. For a chainable builder (`.sort().skip().limit().select()`) use the model facade's `findMany`/`findOne` (`FindManyChain`, `pkgs/akanjs/document/into.ts`).
- **Hydrated vs raw:** server queries return hydrated `cnst.<Model>` instances (with `set`/`save`/`refresh`); client fetch results are raw `GetStateObject` plain data (functions stripped, `pkgs/akanjs/base/types.ts`).
- Every filter generates fourteen methods: `list` · `listIds` · `find` · `findId` · `pick` · `pickId` · `exists` ·
  `count` · `insight` · `query` · **`remove`** · **`removeOne`** · **`update`** · **`updateOne`**. The last four are
  query-level writes — one atomic UPDATE, **no hooks**, and therefore no `_postRemove` and no cascade. Use them on a
  model that carries no removal side effect; otherwise remove documents one at a time.
- **`update<Filter>` / `updateOne<Filter>` are chains, not calls:** `await updateInRoot(rootId).set({ status:
  "archived" })`. The patch cannot trail the filter args — a filter's own args may be optional and no tuple type
  puts a required element after those — so it lands on a terminal `.set()`, mirroring the `UPDATE … SET …` it
  compiles to. Building the chain touches nothing; only `.set()` runs a query.
- `removeOne` / `updateOne` hit the **newest** match — the subquery they compile to is ordered `createdAt` descending
  and there is no way to change that. They also report only counts, never which row they touched, so they are for
  "there is at most one of these", not for claiming the next item off a queue. Pass a query that matches one row.
- **A filter may not be keyed after its own model.** Filter methods are assigned after CRUD, so a filter `chat` on
  model `chat` would silently swap the single-document `removeChat`/`updateChat` for a hookless query-level one. It
  throws at boot instead (`assertFilterFitsCrud`).
- **"Has no value" is `q.empty`, never `q.missing`.** The three absence operators are distinct: `q.exists` is the
  key being present, `q.missing` is the key being *absent from the stored JSON*, and `q.empty` is either — absent,
  or present and null. An optional field is written both ways over its life: an insert that omits it leaves the key
  out, while a document read back and saved carries the explicit `null` that the read materialized. So `q.missing`
  matches a freshly inserted row and silently stops matching that same row after its first round-trip save. Reach
  for it only to find rows written before the field was declared.

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
- Release locks in `finally`. Load heavy optional dependencies through a module-level memoized promise (`puppeteerLoad ??= import("puppeteer")`).

### Error Placement

- State-machine preconditions throw in `document.ts`; cross-document rules throw in `service.ts`; request-level policy belongs in `signal.ts` guards.
- Best-effort code returns a sentinel (`null`, `undefined`, `[0, 0]`, `{}`). There are no Result/Either wrappers.
- `try/catch` is rare and always converts an exception into a decision, never swallows one. Guards catch → `logger.warn` → `return false`; adapters catch → `logger.error` → `return null`; UI uses `try/finally` to reset a spinner. A bodyless `catch {}` is acceptable only with a one-line reason.
- Store actions do not `try/catch` — let the framework toast the `Err`. Client-side validation failure is `msg.error("<key>")` plus an early return, never a throw.

### MCP Exposure

Every signal is served to AI agents as an MCP server on `POST /mcp`. **`/mcp` is mounted by default and exposure
follows an endpoint's guards — there is no per-endpoint opt-in, and nothing to write in a signal file.** An endpoint
that declares a real guard is published; one that declares none is refused, and so is a mutation whose only guard is
`Public`. The guards are already the authorization decision, so a second switch would say nothing they do not —
while guaranteeing that every endpoint added later is invisible to agents until somebody remembers it.

- Settings live in the app's `lib/option.ts` — `option.setMcp({ enabled, readOnly, path, version, instructions,
  allowedOrigins, pageSize, language, auth })`, **not `main.ts`**. Every lib's option is read in mount order with
  the app's last, and each field has an `AKAN_MCP_*` env spelling the option overrides.
- **The refusals are fail-closed**: an endpoint with no `guards`, a mutation with no real guard (`[Public]` is
  having none), `pubsub` and `message`, an `Any` or `Upload` return, a file upload, and a required `Any` argument.
  A `prompt` also refuses a list argument and any `Any` argument.
- **Every refusal is named in the boot log**, with a `MCP catalogue: tools=… prompts=…` count. Read that line
  first when a tool you expected is missing — with no opt-in to notice, it is the only place the answer exists.
  The boot log also names every published entry with no dictionary `.desc()`: an agent picks a tool by its
  description, so write the model `.desc()` the generated entries borrow.
- A refused endpoint answers the *same* "unknown tool" as one that does not exist, and a guard's refusal is
  generalized to `You are not permitted to perform this action.` Never make either message more helpful — the
  difference is what enumerates your private surface.
- **A `field.visual` field is stripped from every MCP result**, and from the readable schema so the two agree — the
  model-level answer to a field the page needs and an agent does not. `resolveReturn` leaves it alone, so the
  browser still receives it.
- **A structured result ships twice by default** — once as `structuredContent`, once as the same JSON in the text
  block, which is what the spec asks for clients predating the structured field and is also a flat doubling of what
  every model-returning tool costs. `option.setMcp({ legacyTextBlock: false })` leaves a pointer there instead.
- `AKAN_MCP_READONLY=true` is the read-only-deployment valve, not the exposure switch; `AKAN_MCP=false` takes the
  whole surface off.
- **`prompt()`** is invoked by the *user* as a slash command, never chosen by the model. `exec` returns
  `PromptMessage[]` built with `Msg.user` / `Msg.assistant` / `Msg.resource` / `Msg.image`; an embedded payload is
  masked by the model you name (`Msg.resource(uri, task, { model: cnst.LightTask })`), and one whose
  `hidden`/`secret` fields are populated with no model named is refused. It is also mounted as a plain HTTP `GET`
  whether or not MCP is enabled, so guard it like any other read.

Full contract — configuration, wire behaviour, resource URIs, OAuth metadata, protocol revisions, and
`McpProgress.report`: `get_guideline` with `mcpRule`, or `akan guideline show mcpRule`.

## In-Page Agent

Every akan app can host a component-level agent that reads the rendered screen and drives it. **A component
declaration is the surface, exactly**: `st.tool` publishes one action, and `st.use` / `st.sel` / `st.ref` make one
store key readable while the reading component is mounted. Nothing is derived from a store class — a lever the
screen does not offer the user is not one an agent may pull in their place. The React core is the `use-agentic`
package; apps and libs never import it directly (`no-import-external-library`) — everything reaches them through
`st.*` and `akanjs/ui`.

- **Mount `<Agent.Chat />` once in a layout.** The endpoint is a stateless relay that **never executes tools**:
  every tool runs in the caller's own browser session, gated by guards and the approval card. Its guard is
  `AgentRelayAccess`, which refuses every call until the app names a guard of its own —
  `option.setAgentAccess(SignedIn)`.
- **The LLM is configured in `option.ts`, never through the environment.** `option.setLlm({ apiKey, model, host })`
  fills whichever adaptor holds `LlmAdaptorRole`; swap providers with `option.applyAdaptor(LlmAdaptorRole, X)`.
- **Declare the tool beside the control that already does it.**
  `st.tool("x").desc("…").arg("id", ID).opt("force", Boolean).exec(fn)` publishes one action and returns the
  callable to hand to `onClick` — one handler for the person and the agent. `.desc()` is required and comes first,
  `.arg()` is an argument the caller must pass and `.opt()` one it may, and `.exec()` is the only hook. Reach a
  store action from the body (`.exec((id) => st.do.removeX(id))`); `st.do` on its own reaches nobody.
- **Publish a tool only where the screen already renders the control.** A falsy name declares the tool without
  publishing it, which is how a conditional surface stays legal — `.exec()` is a hook, so withhold the name, not
  the call. A `disabled` control publishes nothing.
- **A component that renders once per row takes the row id as an argument**, never a closure over it — fifty
  registrations of one name leave forty-nine shadowed. The description is what makes the repeats one declaration:
  same name and same `.desc()` is the same tool registered fifty times, and only a second description under that
  name warns.
- **`{ settle: false }` is the read that returns what is already there.** Every other tool is waited out before
  what it did to the screen is reported, because a write may still be landing when `exec` resolves. `{ confirm }`
  and `{ guard }` ride the same object; a `remove*` name confirms by default.
- **A component that can render twice on one screen takes a `namespace` prop** (`Tab`, `Dialog`, `Dropdown`,
  `ScreenNavigator`) and publishes nothing without one.
- **Forms publish themselves**: a `Field.*` / `Input.*` / `Select` / `Switch` handed `onChange={st.do.setXOnY}`
  **by reference** publishes that setter, and `st.use.yForm()` adds `fillYForm(patch)`. An inline arrow publishes
  nothing — normalize with the control's `transform` prop, and multi-write with a `_postSet<Field>` store method.
- **Reading is per key, not per store.** `st.use.x({ agent: false })` keeps a subscribed key off the surface;
  a key no component reads is unreadable. A value with populated `hidden`/`secret` fields is refused at read.
- **A component's own value is published by its declared type.** `st.expose("taskId", ID).desc("…").value(v)` for
  a derived value and `st.useState("tab", String, { set: true }).desc("…").init("all")` for local state — the type
  typechecks what is handed over and decides how it is read, so a model class masks by that model. `Any` is the
  escape hatch: no typecheck, and the value passes untouched. `.value()` also takes a thunk, read when the agent
  reads.
- **Return what answers the question, not the record.** A tool's value is capped at 20,000 characters before it
  enters the transcript and clipped with a note the model reads (`ToolOutput.limit`), because a store key is sized
  for a screen and not for a model's window: one `readState` of a list whose rows carry inlined bytes is megabytes,
  and from there it rides *every* later turn. Each tool row in the chat carries its own estimated token cost and
  opens onto the value the model was handed — that row is where a conversation that filled up in four messages
  explains itself. A field that is bulky and useless to a model is fixed once at the model instead:
  `field.visual(String)` keeps it on the page and out of every agent-facing read and MCP result.
- **`<Agent.Skip label="site footer">` leaves a region out of the default `readScreen`** — a footer, a cookie
  banner, a nav that repeats on every route. `[skipped: site footer]` stands in its place rather than nothing, since
  a deleted region reads as an absent one, and the marker's name is a `section` that reads the region on request.
  Put `data-agent-skip="<name>"` on the element the page already renders where a wrapper div would move the layout.
  It hides **text, not behaviour**: an `st.tool` inside is published as before. Narrowing from the other side —
  `Agent.Zone`, `readScreen({ section })` — is the better move on a screen that is mostly chrome.
- **Route guidance is `<Agent.Guide instructions="..." />`** rendered from a `_layout.tsx` or page — the render
  tree is the cascade. It is a component, not a `pageConfig` field, and `*.abstract.md` is never served to agents.
- The framework publishes five built-ins on every store surface — `navigate`, `goBack`, `readScreen`,
  `readState(key)`, `highlight(target)` — plus `askUser`, which the session owns. **There is no general-purpose
  wait**: publish an `st.tool` beside the control that starts the work and let it await the work.
- **Model-facing text is English, always** — every `.desc()`, `instructions`, Guide text. The `l()` rule covers
  strings a *user* reads.

Full contract — the chat's own options, attachments and speech, zones, what `akanjs/ui` publishes for you, slash
commands, transcript compaction, and the built-in tool semantics: `get_guideline` with `agentRule`, or
`akan guideline show agentRule`.

## Scalar Modeling (`**/*.constant.ts`)

- Define Akan models in `.constant.ts` files with `via` from `akanjs/constant`.
- Use `Int` for whole-number counts and quantities; use `Float` only for values that need decimals.
- Use `ID` for document references and prefer explicit structured fields over `Any` unless the content is genuinely flexible.
- For date defaults, prefer a function such as `default: () => dayjs()` so the value is created at runtime.
- Follow the established model layering pattern in this order: `Input`, `Object`, `Light<Model>`, full `<Model>`, and `<Model>Insight`. Write all five, and write `<Model>Insight` even when it is empty.
- Put display and predicate logic on the `Light<Model>` class rather than in a util module — see Module File Playbook.
- Defaults are a literal for scalars and a thunk for anything constructed. Arrays are `field([T])`; optional is the postfix `.optional()`.
- **`field.visual(T)` is a field the page renders and an agent never sees** — a blur placeholder, a rendered HTML body, a serialized geometry. It stays an ordinary stored `property` (persistence, search, forms and the page response untouched) and is stripped wherever a value is masked for an AI caller: every in-page-agent read and every MCP result, along with the MCP readable schema. Unlike `hidden`/`secret` it is cost, not secrecy — nothing is refused over one. Reach for it whenever a field is bulky and useless to a model; that is cheaper than every tool learning to avoid it.

### Scalar & Field Type Reference

- **Import from `akanjs/base`** (real classes/helpers, not globals): `Int`, `Float`, `ID`, `Any`, `Binary`, `Upload`, `enumOf`, and the `dayjs` factory. There is **no `JSON` scalar** — use `Any` for open/flexible payloads.
- **Use the JS globals directly (no import needed)**: `String`, `Boolean`, `Date`. They are monkey-patched to behave like scalars, so `field(String)` typechecks.
- **`Number` is not a valid field/body type.** `NumberConstructor` is intentionally not augmented, so `field(Number)` / `.body("x", Number)` fails to typecheck. Use `Int` or `Float` instead.
- Runtime resolution of every scalar (globals included) goes through `PrimitiveRegistry` by `refName` (`pkgs/akanjs/base/primitiveRegistry.ts`).
- **`Binary` is raw bytes on the wire, and never a model field.** It is `Uint8Array` on both sides — a Node
  `Buffer` is one, so a server handler may pass one straight in — and it accepts base64 in either direction, so
  the same declaration serves a JSON body and a binary frame. It is **not storable**: the class build refuses
  `field(Binary)` naming the `File` model instead, because every non-base field lives in the `_doc` JSON column
  and bytes would sit there as base64 and ride every read of the row. Never send bytes as `Any` — `Any` passes a
  `Buffer` through untouched and `JSON.stringify` then spells it `{ type: "Buffer", data: number[] }`, which
  `JSON.parse` never restores; the result is 3.6x the wire and a shape that only breaks at the first byte-offset
  read. MCP refuses a `Binary` return for the same reason it refuses `Any`.

### Text Search Fields — the `text` role

- A field joins the full-text index by declaring one of five roles: `field(String, { text: "title" })`, and likewise
  `"desc"`, `"tag"`, `"thumb"`, `"filter"`. Nothing else opts a field in, and there is no per-model switch.
- Pick the role by what the value *is*, because `bm25` weights them positionally (`title` 10, `tag` 3, `desc` 1,
  `filter` 0): `title` is the one line a human scans for, `desc` is prose, `tag` is a keyword list, `filter` is a
  scoping value (status, owner, role) that must be matchable but must never outrank a real title hit.
- `thumb` is mirrored for rendering a hit and is **not** indexed — never expect it to match.
- **`field.secret`, `field.hidden` and `resolve()` take no `text` role — it is a compile error**, because the
  mirror is plaintext and an indexed secret would leak through search. The class build throws the same refusal as
  a backstop, for an option object the excess-property check cannot see through, and names the way out: drop the
  role, or leave the field unmasked. Do not work around either. The throw also covers a `text` field *underneath*
  one of those — a scalar's own field is reachable through its parent, so `f.secret(Noti)` where `Noti.label`
  carries a role is rejected at the parent, not silently indexed; that one is only reachable at runtime, since the
  pairing spans two files.
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
- Declare an image/file field as a relation to `File`: `image: field(File).optional()` for one, `images: field([File])` for many.
- The store then auto-generates an `upload<Field>On<Model>(fileList)` action that calls the framework upload mutation and polls file status until it leaves `"uploading"` (`pkgs/akanjs/store/action.ts`).
- Storage is wired through the `StorageAdaptor` DI role (default `BlobStorage`, `pkgs/akanjs/service/predefinedAdaptor/storage.adaptor.ts`); the reference implementation is the `file` module. Do not hand-roll data-URL fallbacks.

### Cascade Remove — the `cascade` option

**The value names the direction, and getting it wrong is a data loss.** The two actions can sit on the same field
shape, so `cascade` never means "related" — it means one of exactly these:

- `removeRef` — *when I am removed, remove what this field points at.* Declared on the relation the owner holds:
  `image: field(File, { cascade: "removeRef" })`, arrays included. Only a relation accepts it; a primitive, a bare
  `ID`, and a scalar each fail the class build.
- `removeWith` — *when what this field points at is removed, remove me.* Declared on the child's own reference to
  its owner, so the owner never learns about its children and a lib model can be extended by an app's. Three forms:
  a relation (`field(AgentSession, { cascade: "removeWith" })`), an id with `ref`, or a polymorphic id with
  `refPath`. An array, a Map, `ref` together with `refPath`, and a field naming no owner each fail the class build.
- **A `refPath` must name an `enumOf` field** — a free-form owner type is unknowable at build time, so every
  model's removal would have to sweep the polymorphic table on the chance it is the owner.
- **A cascade goes through the target's service, never its model** — that path is what runs the target's
  `_postRemove`, where a module puts the side effect the removal has to carry.
- **Bulk is decided at boot, per target model, for both directions.** A target with no `remove` schema hook, no
  `_pre`/`_postRemove`, no cascade of its own, and no children takes one `removeManyByQuery`. Adding a
  `_postRemove` silently flips it back to one document at a time — the boot log is the only place that shows.
- **The plan is sealed after every service is live**, so a `listenPost("remove")` registered in `onInit` counts,
  and an unmounted `removeRef` target or `removeWith` owner fails the boot rather than the first removal. An
  unmounted `refPath` candidate only warns, since that list spans optional modules by design.
- **Nothing checks whether another document still references the same target.** `File` in particular is deduped
  by `origin`, so two parents can share one row; `removeRef` claims the field owns its target exclusively.
- Removal is soft (`removedAt`), but the storage delete a `_postRemove` performs is not — a cascade is not
  restorable, and reviving the owner does not revive what went with it.
- A `removeWith` declaration **auto-creates its index** (`{ removedAt, fk }`, or `{ removedAt, typeKey, fk }` when
  polymorphic); every non-base field lives in the `_doc` JSON column, so the lookup would otherwise scan the table.
- **Query-level removes fire no hooks and therefore no cascade** — `removeManyByQuery` / `updateManyByQuery`, the
  generated `remove<Filter>` / `update<Filter>`, and the facade's `removeById` / `updateById`. Remove one document
  at a time when it cascades.
- Cascades are **idempotent**: `removedAt IS NULL` is ANDed into every query-level write. Cycles are cut by a
  visited set carried down the whole chain, with a depth cap of 16.

## Akan Page Routing (`apps/**/page/**`)

- `apps/<app>/page` may contain route modules only. Do not add helper logic or component-only files there.
- Route source files under `page/` must use `.tsx`. Do not add `logic.ts`, `.js`, or `.jsx` files under `page/`.
- A route page is either `<routeName>.tsx` (serving `/routeName`) or a directory's `_index.tsx`; layouts use `_layout.tsx`; per-route UI overrides use `_overrides.tsx`.
- Reserved `_*.tsx` route filenames are limited to `_index.tsx`, `_layout.tsx`, and `_overrides.tsx`; do not add files like `_Component.tsx` or `_helper.tsx`.
- Page filenames must not start with an uppercase letter. Move helper components like `Component.tsx` to app `ui`, `common`, or `lib` instead.
- Dynamic segments use `[id]`; route groups use directories like `(user)`, `(public)`, `(tab)`, or `(detail)`.
- Page modules should usually export `default`, `pageConfig`, `head`, `generateHead`, or `Loading`.
- `_overrides.tsx` is a logic-free UI-override manifest: imports plus a single `export default override({ Slot: AppComponent })` (from `akanjs/ui`), no `"use client"`. It re-skins framework `akanjs/ui` components for its route subtree; nested manifests merge over ancestors slot-by-slot (closest wins). See the UI Customization reference for the slot list.
- Prefer `export default function Page` or `export default async function Page` for page components.
- `libs/<lib>/page` follows the same rules and ships routes to apps that opt in with `syncPageLibs` in `akan.config.ts`: `true` takes every lib dep that has a `page` folder, an array takes the libs listed, `false` (the default) syncs nothing.
- `akan sync` links those routes into `apps/<app>/page/(libs)/(<lib>)` — once per basePath when the app declares subRoutes. The folder is generated and gitignored; edit the lib source, never the link.
- Both path segments are route groups, so a lib route mounts at its own path (`libs/<lib>/page/login/_index.tsx` serves `/login`). Two synced routes that resolve to the same pattern are a sync-time error.
- `export const pageConfig = { devOnly: true }` keeps a route out of `akan build` while it keeps serving under `akan start` and keeps being typechecked. On a `_layout.tsx` it excludes every route under that directory too. Write it as a literal `true`/`false` — the build reads it off the source without evaluating the module.
- Before changing route behavior, check `pkgs/akanjs/server/routeTreeBuilder.ts` and nearby routes for the expected pattern.

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

- `apps/<appName>` root may only contain these files: `AGENTS.md`, `CLAUDE.md`, `akan.app.json`, `akan.config.ts`, `capacitor.config.ts`, `client.ts`, `main.ts`, `package.json`, `server.ts`, `tsconfig.json`, `tsconfig.tsbuildinfo`.
- `apps/<appName>` root may only contain these folders: `.akan`, `android`, `common`, `env`, `ios`, `lib`, `mobile`, `page`, `plugin`, `private`, `public`, `script`, `secrets`, `srvkit`, `ui`, `webkit`.
- `libs/<libName>` root may only contain these files: `AGENTS.md`, `CLAUDE.md`, `README.md`, `akan.config.ts`, `akan.lib.json`, `client.ts`, `index.ts`, `package.json`, `server.ts`, `tsconfig.json`, `tsconfig.spec.json`, `tsconfig.tsbuildinfo`.
- `libs/<libName>` root may only contain these folders: `common`, `env`, `lib`, `page`, `plugin`, `private`, `public`, `srvkit`, `ui`, `webkit`. A library is never booted or packaged as an app, so the run and mobile entries an app carries (`main.ts`, `capacitor.config.ts`, `.akan`, `android`, `ios`, `mobile`, `script`, `secrets`) are rejected there.
- Both allowlists have one source — `pkgs/@akanjs/devkit/workspaceLayout.ts`. `akan sync` (error), `akan doctor`
  (diagnostic), and `akan quality scan` (warning) all read it, so add a new root entry there and mirror it into this
  list, never into one of the three call sites.
- `akan sync` maintains a scoped agent guide per app/lib: `apps/<app>/AGENTS.md` / `libs/<lib>/AGENTS.md`. The
  section between the `akan:agent` markers (the `## Recipes In Scope` index) is generated — do not hand-edit it;
  content outside the markers is yours. `akan lint` fails when the generated section is stale.
- The `plugin/` facet holds Akan plugin declarations; files use the `<name>.plugin.ts` convention (e.g. `pushNotification.plugin.ts`) and are re-exported from the generated `plugin/index.ts` barrel.
- Do not add `apps/*/base` or `libs/*/base`; place shared utilities under that app or lib's own `common/`.
- `apps/*/lib` and `libs/*/lib` root files are limited to generated/support files: `cnst.ts`, `db.ts`, `dict.ts`, `option.ts`, `sig.ts`, `srv.ts`, `st.ts`, `useClient.ts`, `useServer.ts` — plus a `<model>.signal.test.ts` / `.spec.ts`, the one hand-written file that belongs there because the suite boots the whole barrel.
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
- `libs/<lib>/ui/tokens.css` is the one CSS file a lib owns: plain `:root` custom properties for colors that must **not** follow the theme (a vendor brand color, a fixed surface). Every app whose pages reach that lib compiles it automatically, ahead of the app's own stylesheets, so nothing is imported by hand and no app can forget it. Reference them as `bg-[var(--kakao)]`; `@theme` extensions stay in the app stylesheet, because the color vocabulary is closed per stylesheet. Theme-following colors are the app's, not the lib's.
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
- Raw palette grays such as `text-gray-400` instead of the semantic tokens (`text-foreground/70`).

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
cd dist/apps/<appName> && USE_AKANJS_PKGS=true AKAN_PUBLIC_REPO_NAME=<repo> AKAN_PUBLIC_SERVE_DOMAIN="<domain>" \
  AKAN_PUBLIC_APP_NAME=<appName> AKAN_PUBLIC_ENV=local AKAN_PUBLIC_OPERATION_MODE=local SERVER_MODE=federation \
  AKAN_PUBLIC_BASE_PATHS=<basePaths> bun main.js
```
