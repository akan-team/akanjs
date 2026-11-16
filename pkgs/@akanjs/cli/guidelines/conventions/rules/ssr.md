---
description: The client/server boundary and SSR-first rendering for .tsx files and pages.
paths:
  - "{apps,libs}/**/*.tsx"
  - "{apps,libs}/**/page/**"
---

# Client/Server Boundary And SSR

- `"use client";` tops client component files. It is mechanical by role: `Template`, `Zone`, `Util` always carry it
  on line 1; `Unit`, `View` never do. `usePage()` is legal in server files.
- A `"use client"` file re-exports by name (`export { A, B } from "./x"`), never `export *` — the server knows a
  client module only by the names it spells out, so `akan start` / `akan build` stop on a star re-export.
- **Never import across the client/server boundary** (`apps/**`, `libs/**`; `no-import-server-in-client`,
  `no-import-client-in-server`). Client files (`ui/`, `webkit/`, `page/`, `*.store.ts`, every `.tsx`) never import a
  `*.document|dictionary|service|signal.ts`, `srvkit/`, a package `server` entrypoint, or the `db` / `srv` / `sig` /
  `dict` / `option` / `useServer` barrels. Server files (those four suffixes, `srvkit/`) never import a `*.store.ts`, a
  module component, `ui/`, `webkit/`, a package `client` entrypoint, or the `st` / `store` / `useClient` barrels.
  `common/` and `*.constant.ts` obey both. `import type` is legal everywhere; a mixed value-and-type import is not.
- **Server-component discipline** on `page/**`, `*.Unit.tsx`, `*.View.tsx` (`no-import-client-functions`,
  `no-use-client-in-server`, `non-scalar-props-restricted`).
- **Server is the default.** `akan quality ssr` prints each app's and lib's server share: 50% is the floor, and a
  falling share is a regression to justify in the PR or revert. Why, what earns the directive and the ten-step
  playbook (wrap the interaction, split compound components, fetch in the route, hand promises across, …): `ssrRule`
  in the `akan-ui` skill.
