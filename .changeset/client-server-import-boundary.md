---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

feat(lint): enforce the client/server import boundary in both directions

The layering was documented but nothing checked it. A `.tsx` could `import * as db from "../db"`, a `*.service.ts`
could `import { st } from "@libs/shared/client"`, and a `*.constant.ts` could reach either side — each one a value
edge that drags the whole opposite graph along. In the client direction that means the database driver,
`node:crypto`, and any secret resolved from `process.env` land in the browser bundle; in the server direction it
means React, the store, and the browser globals underneath them load into every CLI command, worker, and migration
that touches a service. Both usually fail the build rather than failing at runtime, and the failure names a
transitive module, never the import that caused it.

Two rules now hold the line, symmetric by design:

- `no-import-server-in-client.grit` runs on client files (`ui/`, `webkit/`, `page/`, `*.store.ts`, every `.tsx`) and
  bans `*.document` / `*.dictionary` / `*.service` / `*.signal` modules, `srvkit/`, package `server` entrypoints
  including `akanjs/server`, and the `db` / `srv` / `sig` / `dict` / `option` / `useServer` barrels.
- `no-import-client-in-server.grit` runs on server files (those four suffixes plus `srvkit/`) and bans `*.store`
  modules, module components (`*.Template` / `*.Unit` / `*.Util` / `*.View` / `*.Zone`), `ui/`, `webkit/`, package
  `client` entrypoints including `akanjs/client`, and the `st` / `store` / `useClient` barrels.

Shared files — `common/` and `*.constant.ts` — are wired into **both** overrides, so they reach neither side, which
is what makes them safe for either to import.

`import type` is exempt in both directions: it is erased before bundling, so it emits no edge, and a shared file
that only needs to name a server-side type (`libs/shared/lib/summary/summary.constant.ts` names `UserFilter` from
`user.document`) stays legal. A mixed value-and-type import is not exempt — it emits a real edge. Test files are
excluded, as are `pkgs/akanjs/**`, which implements the boundary and is where the two graphs legitimately meet.

Both rules land green: no `apps/**` or `libs/**` file crosses the boundary today, so this is a ratchet, not a
migration.
