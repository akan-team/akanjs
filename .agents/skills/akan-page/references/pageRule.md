<!-- akan:generated -->

# Page Rule — Guards In Depth, Heads, CSR Root Layouts, Lib Pages

What neither the `page` rule nor the `akan-page` skill says; nothing either of them says is repeated here.

## Guards On A Client Navigation

- **A page's layers wait for its guards.** The verdict is kept by what the guards read (a query only the page reads
  keeps it) and lasts while a layer of that location is on screen. Only the page in front asks — never a parked one,
  nor the one under it during a swipe back; back in front, a cached page included, it asks again in the background
  while what it drew stays, and a refusal moves the router and blanks it. A guard that moves the router ends the chain
  and the page draws nothing; a refused or failed check runs again when its layer is retried.
- Root layouts are drawn once for every page and are not gated themselves; their guards still run in each page's
  chain, and a legacy page under them waits too. `guard` is a stage only: a legacy module that exports one, a root
  layout's included, fails to load and fails `akan build`.
- **Not found.** On the server a refusal's not-found keeps only the layouts above the refusing guard, and a path no
  page matches asks the guards of the layouts its not-found would sit under first. In a CSR bundle such a path draws
  the deepest `.notFound()` of the layouts it sits under, or a default page, once those layouts' guards let it in, and
  `router.notFound()` moves to `/404`, drawn the same way.
- The page tools in MCP `tools/list` show only the screens whose guards admit the caller; a listing knows no
  arguments, so a guard that reads one admits there and is checked again on the call.

## Navigation Guards

- `router.addNavigationGuard(guard)` is what `useNavigationGuard` registers. `guard({ kind, from, to })` is asked
  before every in-app move — `push`, `replace`, `back`, a `Link`, the browser's back and forward (`pop`), a native
  back or swipe, the agent's `navigate` and `goBack` — with routes free of locale and basePath and `to: null` for a
  `back`. `false`, a throw or a rejection keeps the page, `router.navigation()` rejects with `NavigationRefused`, and
  a refused browser back is undone before the page redraws. Guards answer one at a time; a move started while one
  decides is refused.
- `useNavigationGuard` holds its guard only while its page is current: a page kept under the next for a swipe back
  stays mounted, and a guard it kept would hold that page too. Redirects, `notFound()`, `setLang` and moves off the
  origin are not asked; a closing tab is `beforeunload`'s.

## MCP Apps

- An `.app()` name is a string literal matching `^[A-Za-z0-9_-]{1,64}$` (the build reads it off the source). A name
  `.render()` already receives (`lang`, a `.param()` / `.search()` name, another app) fails to compile and throws when
  the module loads, as does an app named like the page's `.prompt()`. The rest of `.app()` is `mcpRule`.

## Heads

- A `.head()` that throws renders no head (warned about), so a layout's sign-in redirect still answers. Analytics is
  the app's own script, not a stage.
- The tags a deeper `.head()` replaces are the `<title>`, a `<meta>` with the same `name` / `property`, and a
  canonical / manifest / icon link; it keeps the rest, so a page states only what it changes. A level that writes
  `og:image` or `twitter:image` drops the `og:image:*` / `twitter:image:*` tags it inherits, and a
  `<meta name="theme-color">` replaces the root `.viewport({ themeColor })`'s. Only `.head()` merges: a `<title>` or
  `<meta>` written inside a component renders beside the merged head, so a second `<title>` can reach the document.
- **The script policy.** Every HTML response sends `Content-Security-Policy-Report-Only: script-src …
  'strict-dynamic'`. A `<script src>` in JSX needs `nonce={scriptNonce()}` too (its host in a policy does nothing
  under `'strict-dynamic'`); the hash `scriptHashes()` takes is the one the browser prints in its console report; and
  reading `scriptNonce()` makes the page dynamic, so no result cache keeps it. Both do nothing in the browser and are
  too late outside a `.head()`: the header leaves with the first byte. An `onclick="…"` attribute and a `javascript:`
  URL have no such form. `AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY=off` drops the header,
  `AKAN_CONTENT_SECURITY_POLICY_REPORT_URI` names where the browser posts reports, and
  `AKAN_CONTENT_SECURITY_POLICY_SCRIPT_SRC` adds sources to every response (`'wasm-unsafe-eval'` for a page that
  compiles WebAssembly). A response names at most 32 hashes (its header stays under 2 KB, inside the 4 KB a proxy
  reads headers into): `scriptHashes()` past that are left out with one warning per route, and a page whose cached
  replay would need more (one per streamed boundary) is rendered each time, answering
  `X-Akan-Cache-Reason: script-hashes`.
- **`load` and `DOMContentLoaded` can fire before client code runs.** The client entry is a module the document's
  bootstrap script adds, not a tag in the markup, so neither event waits for it. A listener for either is added only
  after checking `document.readyState` (`"complete"` for `load`, not `"loading"` for `DOMContentLoaded`) and calling
  the handler directly when it already holds. A browser test waits for what the hydrated page does (the result of
  its action, or a marker a client component sets in an effect), never for navigation's `load`.

## A Root Layout Inside A CSR Bundle

- In a native app or `?csr=true`, pages render into the frame, and what the root layout draws around `{children}`
  stays in a hidden container, so its wrappers cannot stack a second screen beside the frame. Its components still
  mount and their effects run (`<Auth.User />` works); `<Agent.Chat />` and the dialogs already portal. A non-root
  `_layout.tsx` has no such limit. A gate belongs in the root layout's `.guard()`, which runs in every page's chain.

## Lib Pages

- `libs/<lib>/page` follows the same rules as an app's. An app that declares subRoutes gets the link once per
  basePath, and the folder is gitignored like `public/libs`.
- Both path segments are route groups, so a lib route mounts at its own path (`libs/<lib>/page/login/_index.tsx`
  serves `/login`). Two synced routes that resolve to the same pattern are a sync-time error.

## `devOnly` And The Legacy Shape

- A `devOnly` route keeps serving under `akan start` and keeps being typechecked; on a `_layout.tsx` it excludes every
  route under that directory too. It is a literal because the build reads it off the source without evaluating it.
- The legacy shape — `export default async function Page` beside `pageConfig` / `head` / `Loading` exports — still
  loads and logs one deprecation warning per file at boot. Migrate with the `workspaceRecipes` recipe "Migrating
  `page/` to the route chain".
