# Page Rule — Route Files, The Route Chain, Heads, Lib Pages

What a file under `page/` may be, how a route declares its arguments and settings, how heads merge, what a CSR
bundle shows of a root layout, and how a lib's routes reach an app. `conventions` carries the invariants and the page
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
  a stage of the chain — `.param()`, `.search()`, `.config()`, `.head()`, `.loading()`; `.notFound()` / `.error()` on
  a layout; `.fonts()` / `.theme()` / `.manifest()` / `.reconnect()` / `.wsConnect()` / `.layoutStyle()` /
  `.viewport()` on the root layout; `.prompt()` on a page. A named export beside the chain, or `page()` in a
  `_layout.tsx`, fails the build.
- **A page names every `[x]` segment of its path with `.param("x", Type)`** and reads a query key only through
  `.search("k", Type)`. Values arrive typed — `ID`/`String` → string, `Int`/`Float` → number, `Boolean`, `Date` →
  Dayjs, an `enumOf` class → its union, `[T]` → array — a path value the type refuses answers not-found, and a
  search value that fails is dropped. A layout may declare a subset. Names are string literals: `akan sync` reads
  them off the source and refuses a `[projectId]` folder whose page declares no `.param("projectId")`.
- **`lang` is never declared**: every route sits under `/:lang`, and the locale segment reaches every stage as
  `lang`.
- **On a web page's first render `st.use.searchParams()` is still the server's empty snapshot**, synced right after
  hydration, so an effect that needs the query on its first run takes the page's `.search()` value as a prop.
- There is no `loader=` / `render=` page prop and no `PageProps` interface: the chain declares the arguments and
  `.render()` receives them flat, typed, with `lang` on every route and `children` added for a layout.

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
  such limit.

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
