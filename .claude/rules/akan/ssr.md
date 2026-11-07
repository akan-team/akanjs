---
description: The client/server boundary and SSR-first rendering for .tsx files and pages.
paths:
  - "apps/**/*.tsx"
  - "libs/**/*.tsx"
  - "apps/**/page/**"
  - "libs/**/page/**"
---

<!-- akan:generated -->

# Client/Server Boundary And SSR

## Client / Server Boundaries

- `"use client";` tops client component files. It is mechanical by role: `Template`, `Zone`, `Util` always carry it
  on line 1; `Unit`, `View` never do. `usePage()` is legal in server files.
- A `"use client"` file re-exports by name (`export { A, B } from "./x"`), never `export *` — the server knows a
  client module only by the names it spells out, so `akan start` / `akan build` stop on a star re-export.
- Keep page props serializable unless the route pattern clearly allows otherwise; be careful importing client-only
  code into pages and layouts. Preserve file roles (`.document.ts`, `.service.ts`, `.store.ts`, `.constant.ts`,
  `.client.ts`), and inspect nearby files before introducing a new boundary pattern.

- **Never import across the client/server boundary** (`apps/**`, `libs/**`). Client files (`ui/`, `webkit/`,
  `page/`, `*.store.ts`, every `.tsx`) never import a `*.document|dictionary|service|signal.ts`, `srvkit/`, a
  package `server` entrypoint, or the `db` / `srv` / `sig` / `dict` / `option` / `useServer` barrels. Server files
  (those four suffixes, `srvkit/`) never import a `*.store.ts`, a module component, `ui/`, `webkit/`, a package
  `client` entrypoint, or the `st` / `store` / `useClient` barrels. `common/` and `*.constant.ts` obey both.
  `import type` is legal everywhere; a mixed value-and-type import is not.
- **Server-component discipline** on `page/**`, `*.Unit.tsx`, `*.View.tsx` (`no-import-client-functions`,
  `no-use-client-in-server`, `non-scalar-props-restricted`).

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
slots (`Layout.Navbar`); ⑦ derived display logic on `Light<Model>`; ⑧ `.guard(() => signedIn())`
(`@libs/shared/webkit`) on `_layout.tsx` (a real 3xx before anything renders; `getSelf({ unauthorize })` in a body
redirects in-page after I/O); ⑨ CSS (`data-*` + `group-data-[…]`, `<details>`) over client state for visibility;
⑩ heavy islands behind `index_.tsx` + `lazy()`.
