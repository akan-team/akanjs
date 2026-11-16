---
description: Route files under page/: the one chain, params, heads, guards and lib pages.
paths:
  - "{apps,libs}/**/page/**"
---

# Akan Page Routing

Steps, typed values, loading and error views, Link and the router: the `akan-page` skill. Full contract — guards,
apps, heads, CSR root layouts, lib pages, `devOnly`: `pageRule`.

- `page/` holds `.tsx` route modules only: `<routeName>.tsx` or `_index.tsx`, `_layout.tsx`, `_overrides.tsx` — no
  other `_*.tsx`, helpers, `.ts` / `.js` files, or uppercase filenames. `[id]` is a dynamic segment, `(group)` a
  route group.
- **A route file exports one chain** — `page()`, `layout()` in a `_layout.tsx`, `rootLayout()` in a root
  `_layout.tsx` — and every setting is a stage (`.param`, `.search`, `.config`, `.guard`, `.head`, `.loading`;
  `.notFound` / `.error` on layouts; `.fonts` / `.theme` / `.manifest` / … on the root; `.prompt` / `.app` on a page).
  A named export beside it fails the build, and the legacy `export default async function Page` is never written anew.
- **Name every `[x]` segment with `.param("x", Type)`** and read query keys only via `.search("k", Type)`; a layout
  may declare a subset. `akan sync` reads the names off the `export default` chain itself, so it refuses a chain bound
  to a variable first and a `[x]` folder whose page declares no `.param("x")`. `lang` is never declared — every stage
  receives it.
- `.head()` takes JSX or a function returning it — never a metadata object; deeper heads replace by tag identity,
  and a canonical link / `og:url` comes only from the page's own `.head()`.
- In a CSR bundle a root layout's own markup is hidden: what a person must see from it renders through
  `createPortal(…, document.body)`.
- `libs/<lib>/page` reaches an app through `syncPageLibs`, linked into the generated `page/(libs)/(<lib>)`; edit the
  lib source, never the link. `.config({ devOnly: true })` (a literal) keeps a route out of `akan build`.
- `.render()` gets the declared args flat and typed (no `PageProps`, no `loader=` prop). Order: `usePage()`, fetch,
  return. Hand `fetch.init*` / `view*` / `edit*` fields to sections unawaited; await only what the shell reads
  (title, redirect, link id) in one `Promise.all`. `async` only when the body awaits; the callback is not a React
  component, so it takes no name and no return type. No `useState`, `useEffect`, or comments in page files.
- **A field's refusal belongs to its `Load.*`**, which draws a notice in its place while the page answers 200. So a
  field reaches only a `Load.*`, directly or through a Zone. Awaited in a component below the page, rendered as a
  child or `use()`-d outside `Load.*`, a refused field takes its whole route level, which draws a retryable notice
  under the layouts above it, as any server error after the first byte does. Await the handle
  (`await fetch.initX()`) instead, so a refusal takes the layout's `.error()`.
- **A route never writes while it renders**: a `fetch.<mutation>()` (or socket message) in a stage or a component it
  renders throws `base.error.mutationInRender` before it is sent, synchronously, so a `.catch()` on its promise never
  sees it: opening a link would perform it. Send it from a user action; `{ duringRender: true }` only for a write
  harmless to repeat and safe for anyone to trigger (`ssrRule`).
- **Gate auth at the layout**: `.guard(() => signedIn())` on the `_layout.tsx` chain answers a real 307 before any of
  it renders, where a check in `.render()` after awaited I/O redirects in-page as an HTTP 200; repeat it on a page
  that needs more. It is a courtesy — the endpoint guards are the gate. `getSelf({ unauthorize })` in a body still
  works. `signedIn()` comes from `@libs/shared/webkit`, which a new workspace has only with
  `create-workspace --libs true`.
