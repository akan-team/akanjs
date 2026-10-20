---
"akanjs": minor
"@akanjs/devkit": patch
---

A route can check who may open it before anything on it renders. `rootLayout()`, `layout()` and `page()` take a `.guard(fn)` stage, declared at most once per route. It receives the route's typed arguments and `lang` (a layout's guard gets no `children`). It refuses with `router.redirect()` or `router.notFound()`, or with `getSelf({ unauthorize })` from a guard. The new `signedIn()` helper in `libs/shared/webkit` does the last of these.

- **Server render.** Every guard in the chain runs in order before any layout body starts, root layout first. A redirect after an awaited query is now a real 307, and a not-found is a 404. Before this, a refusal raised inside a layout body after I/O arrived as a late, in-stream redirect. A query inside a guard that the server refuses with 403 or 404 (an owner check, for example) answers not-found, so the page does not tell anyone the record exists.
- **Client navigation.** A page's layers wait for its guards, which run once per location. A guard that moves the router ends the chain, and the page draws nothing. A refused or failed check runs again when the cached page comes back on screen or its layer is retried. Root layouts are drawn once for every page and are not gated themselves, but their guards still run in each page's chain, and a legacy page under them waits for them too.
- **A refusal shows nothing of what it refused.** The not-found page that a guard's `router.notFound()` answers is drawn under the layouts above the refusing guard only, with no route head.
- **`guard` is a stage only.** A legacy module (a default function beside named exports) that exports `guard` fails to load.
- **MCP.** A page prompt runs its route's guards before its bodies, so a refusal ends the prompt as a redirect or a not-found. `prompts/list` and the app tools in `tools/list` show only the screens whose guards admit the caller. In a listing, no arguments are known yet: a guard that reads one counts as admitting the caller there, and is checked again when the prompt or tool is called. If the guards do not answer within the list wait, the list is served unfiltered, and the calls are still checked. `resources/list` shows a UI host only the views of the apps it may call. A caller's listing verdict is kept for 5 seconds, so a host that lists tools, prompts and resources in a row runs the guards once.

A generated root layout passes the user layout's guard through. When there is no ancestor root, it composes the app root's guard and the user layout's guard with the new `RouteGuards.compose`.
