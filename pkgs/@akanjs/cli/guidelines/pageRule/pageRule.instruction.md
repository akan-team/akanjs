# Page Rule — Route Files, The Route Chain, Heads, Lib Pages

What a file under `page/` may be, how a route declares its arguments and settings, how a route guards itself, how
heads merge, what a CSR bundle shows of a root layout, and how a lib's routes reach an app. `conventions` carries the invariants and the page
body shape — this is the full contract behind them. Before changing route behavior, check
`pkgs/akanjs/server/routeTreeBuilder.ts` and nearby routes for the expected pattern.

## Route Files

- `apps/<app>/page` may contain route modules only. Do not add helper logic or component-only files there.
- Route source files under `page/` must use `.tsx`. Do not add `logic.ts`, `.js`, or `.jsx` files under `page/`.
- A route page is either `<routeName>.tsx` (serving `/routeName`) or a directory's `_index.tsx`; layouts use
  `_layout.tsx`; per-route UI overrides use `_overrides.tsx`.
- Reserved `_*.tsx` route filenames are limited to `_index.tsx`, `_layout.tsx`, and `_overrides.tsx`; do not add
  files like `_Component.tsx` or `_helper.tsx`.
- Page filenames must not start with an uppercase letter. Move helper components like `Component.tsx` to app `ui`,
  `common`, or `lib` instead.
- Dynamic segments use `[id]`; route groups use directories like `(user)`, `(public)`, `(tab)`, or `(detail)`.
- `_overrides.tsx` is a logic-free UI-override manifest: imports plus a single
  `export default override({ Slot: AppComponent })` (from `akanjs/ui`), no `"use client"`. It re-skins framework
  `akanjs/ui` components for its route subtree; nested manifests merge over ancestors slot-by-slot (closest wins).
  The slot list is in `componentRule`.

## The Route Chain

- **A route file exports one thing**: `export default page()…render(…)` for a page, `layout()…render(…)` for a
  `_layout.tsx`, `rootLayout()…render(…)` for the app's (or a basePath's) root `_layout.tsx`. Every route setting is
  a stage of the chain — `.param()`, `.search()`, `.config()`, `.guard()`, `.head()`, `.loading()`; `.notFound()` /
  `.error()` on a layout; `.fonts()` / `.theme()` / `.manifest()` / `.reconnect()` / `.wsConnect()` /
  `.layoutStyle()` / `.viewport()` on the root layout; `.prompt()` and `.app()` on a page. A named export beside the
  chain, or `page()` in a `_layout.tsx`, fails the build.
- **A page names every `[x]` segment of its path with `.param("x", Type)`** and reads a query key only through
  `.search("k", Type)`. Values arrive typed — `ID`/`String` → string, `Int`/`Float` → number, `Boolean`, `Date` →
  Dayjs, an `enumOf` class → its union, `[T]` → array — a path value the type refuses answers not-found, and a
  search value that fails is dropped. A layout may declare a subset. Names are string literals: `akan sync` reads
  them off the source and refuses a `[projectId]` folder whose page declares no `.param("projectId")`, so the chain
  is the `export default` expression itself — one bound to a variable first is refused.
- **`lang` is never declared**: every route sits under `/:lang`, and the locale segment reaches every stage as
  `lang`.
- **On a web page's first render `st.use.searchParams()` is still the server's empty snapshot**, synced right after
  hydration, so an effect that needs the query on its first run takes the page's `.search()` value as a prop.
- There is no `loader=` / `render=` page prop and no `PageProps` interface: the chain declares the arguments and
  `.render()` receives them flat, typed, with `lang` on every route and `children` added for a layout.

## Route Guards — `.guard()`

- **`.guard(fn)` decides who may open a route before any of it renders.** Every chain takes it, once: a second
  `.guard()` throws when the module loads. `fn` receives the route's typed arguments and `lang` (a layout's gets no
  `children`) and may be `async`. It refuses by moving the router — `router.redirect(href)`, `router.notFound()` — or
  with `getSelf({ unauthorize })`; `signedIn()` from `@libs/shared/webkit` is that last one, called inside an arrow
  (`.guard(() => signedIn())`), because `.guard(signedIn)` would hand the route's arguments to `unauthorize`.
- **On the server every guard of the chain runs before any layout body starts**, root layout first and before the
  route's arguments are checked, so a redirect is a real 307 even after an awaited query, and a not-found is a 404 —
  where a `getSelf({ unauthorize })` inside a layout body after I/O redirects late, inside the stream. A query in a
  guard that the server refuses with 403 or 404 (an owner check) answers not-found, so the page never confirms the
  record exists. A refusal's not-found keeps only the layouts above the refusing guard, and a path no page matches
  asks the guards of the layouts its not-found would sit under first.
- **On a client navigation a page's layers wait for its guards.** The verdict is kept by what the guards read (a
  query only the page reads keeps it) and lasts while a layer of that location is on screen. Only the page in front
  asks — never a parked one, nor the one under it during a swipe back; back in front, a cached page included, it asks
  again in the background while what it drew stays, and a refusal moves the router and blanks it. A guard that moves
  the router ends the chain and the page draws nothing; a refused or failed check runs again when its layer is
  retried. Root layouts are drawn once for every page and are not gated
  themselves; their guards still run in each page's chain, and a legacy page under them waits too. In a CSR bundle a
  path no page matches draws the deepest `.notFound()` of the layouts it sits under, or a default page, once those
  layouts' guards let it in, and `router.notFound()` moves to `/404`, drawn the same way. `guard` is a stage
  only: a legacy module that exports one, a root layout's included, fails to load and fails `akan build`.
- **MCP runs them too**: a prompt or an app tool runs its route's guards before anything else, and `prompts/list` and
  the page tools in `tools/list` show only the screens whose guards admit the caller (a listing knows no arguments,
  so a guard that reads one admits there and is checked again on the call).
- **A route guard is not authorization for data.** It keeps a person off a screen and redirects early; every query
  the screen makes is still judged by that endpoint's own `guards`. Write both: the signal guard is the gate, the
  route guard is the courtesy that answers before the screen draws.

## MCP Apps — `.app()`

- **`.app(name, description, load)` publishes one component of a page as an MCP App**: a read-only tool of that name,
  whose arguments are the page's `.param()` and `.search()` stages, and a single-file view of its own. `load` receives
  the page's typed arguments and `lang` and returns the element (usually a `Zone` fed by unawaited `fetch.*` fields);
  on the web that element reaches `.render()` as the argument named `name`, so the page places it.
- A page may declare several. A name matches `^[A-Za-z0-9_-]{1,64}$`, is a string literal (the build reads it off the
  source), shares one namespace with every page's prompts and apps, and needs an English description. A name
  `.render()` already receives (`lang`, a `.param()` / `.search()` name, another app) fails to compile and throws when
  the module loads, as does an app named like the page's `.prompt()`.
- **`load` may only query** (`base.error.mutationInApp` otherwise): keep writes in `.render()` around the element, and
  gating in `.guard()`. The view runs `load` with no layout body and no `.render()`: it gets the root layout's theme,
  fonts and framework providers through the generated `McpAppRoot` and the `_overrides.tsx` over the page (one the web
  draws outside the root layout wraps `McpAppRoot`, its toasts included), and nothing a layout body provides. The
  chain is the `export default` expression itself: one bound to a name fails the build. Full contract: `mcpRule`.

## Heads

- **`.head()` takes JSX — `<title>`, `<meta>`, `<link>` — or a function of the route's args returning it.** One that
  throws renders no head (warned about), so a layout's sign-in redirect still answers. There is no metadata object,
  and analytics is the app's own script, not a stage.
- **Heads merge root first**: a deeper `.head()` replaces the `<title>`, a `<meta>` with the same `name` /
  `property`, and a canonical / manifest / icon link, and keeps the rest — so a page states only what it changes.
- A canonical link and `og:url` each name one URL, so a page carries them only from its own `.head()`, never from a
  layout's.

## A Root Layout Inside A CSR Bundle

- **A CSR bundle (a native app, `?csr=true`) never shows a root layout's own markup.** Pages render into the frame,
  and what the root layout draws around `{children}` stays in a hidden container, so its wrappers cannot stack a
  second screen beside the frame. Its components still mount and their effects run (`<Auth.User />` works).
- Anything a person must see from a root layout — an overlay, a gate, a banner — renders through
  `createPortal(…, document.body)`, as `<Agent.Chat />` and the dialogs already do. A non-root `_layout.tsx` has no
  such limit. A gate belongs in the root layout's `.guard()`, which runs in every page's chain.

## Lib Pages — `syncPageLibs`

- `libs/<lib>/page` follows the same rules and ships routes to apps that opt in with `syncPageLibs` in
  `akan.config.ts`: `true` takes every lib dep that has a `page` folder, an array takes the libs listed, `false` (the
  default) syncs nothing.
- `akan sync` links those routes into `apps/<app>/page/(libs)/(<lib>)` — once per basePath when the app declares
  subRoutes. The folder is generated and gitignored like `public/libs`; edit the lib source, never the link.
- Both path segments are route groups, so a lib route mounts at its own path (`libs/<lib>/page/login/_index.tsx`
  serves `/login`). Two synced routes that resolve to the same pattern are a sync-time error.

## Build Scope And The Legacy Shape

- `.config({ devOnly: true })` keeps a route out of `akan build` while it keeps serving under `akan start` and keeps
  being typechecked. On a `_layout.tsx` it excludes every route under that directory too. Write it as a literal
  `true`/`false` — the build reads it off the source without evaluating the module.
- The legacy shape — `export default async function Page` beside `pageConfig` / `head` / `Loading` exports — still
  loads and logs one deprecation warning per file at boot. Migrate with the `workspaceRecipes` recipe "Migrating
  `page/` to the route chain"; new files are never written in it.
