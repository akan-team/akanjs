---
name: akan-deps
description: "Fix an import, dependency, or barrel problem in an Akan workspace — barrels are generated, and a third-party package may not be imported from most files."
---

<!-- akan:generated -->

# Akan imports, deps and barrels

## Barrels are generated

Every `index.ts` under `ui/`, `webkit/`, `srvkit/`, `common/`, `plugin/` and `lib/**` is scanner output, as
are `cnst.ts`, `db.ts`, `dict.ts`, `sig.ts`, `srv.ts`, `st.ts`, `useClient.ts`, `useServer.ts`, `client.ts`
and `server.ts`. Do not hand-edit them and do not rely on their exact contents.

**If an import "cannot be found" but the file exists, the barrel is stale** — run `akan sync <app-or-lib>`,
or `repair_generated`. A `ui/<Folder>/index.tsx` that builds a namespace is hand-written source; the
distinguishing test is that a generated barrel contains nothing but `export * from "./X";` lines.

## Where a dependency is declared

Add the package to the `package.json` of the app or lib that imports it —
`apps/<app>/package.json` or `libs/<lib>/package.json` — then `bun install` from the repo root.

## A third-party package may not be imported from most files

`no-import-external-library.grit` refuses a third-party import from `page/**`, from any barrel, and from any
`*.{constant,dictionary,document,service,signal,store}.ts` or `*.{Template,Unit,Util,View,Zone}.tsx`.
Re-export the symbol through a lib first. The one-line re-export shims in a lib's `common/`, `webkit/` and
`ui/` exist for exactly this — they are load-bearing, not cruft.

## Two more import rules the build enforces

- **No deep import past a barrel** (`no-deep-internal-import.grit`). Cross-module constant references such as
  `../map/map.constant` are the sanctioned exception.
- **No import across the client/server boundary.** A client file may not import a `*.document.ts` /
  `*.dictionary.ts` / `*.service.ts` / `*.signal.ts`, `srvkit/`, a package `server` entrypoint, or the `db` /
  `srv` / `sig` / `dict` / `option` / `useServer` barrels. A server file may not import a `*.store.ts`, a
  module component, `ui/`, `webkit/`, a package `client` entrypoint, or `st` / `store` / `useClient`. Shared
  files — `common/` and `*.constant.ts` — are held to **both**. `import type` is erased and stays legal in
  every direction; a mixed value-and-type import is not exempt.

## Aliases

`akanjs/*` for framework facets, `@apps/*`, `@libs/*`, `@contract/*`. In `.tsx`, one flat named import from
the package client path — `import { cnst, fetch, st, usePage } from "@apps/<app>/client"` — never a relative
`../` import. In backend `.ts`, namespace the generated barrels: `import * as cnst from "../cnst"`.

## Validate

`akan verify`. Raw `tsc` misses the generated barrels and reports false errors.
