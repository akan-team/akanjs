---
description: The shared layers common/, webkit/, srvkit/, ui/, plugin/, native/: what each admits.
paths:
  - "{apps,libs}/*/{common,webkit,srvkit,ui,plugin,native}/**"
---

# Layer Placement

| Folder | Admission test | Naming |
|---|---|---|
| `common/` | pure, isomorphic, zero-dependency; imports only sibling `common/*` and `akanjs/base` (so no `Err`, and no throwing code) | camelCase file named after its single export |
| `webkit/` | touches `window` / `navigator` / the native bridge (`akanjs/client/native[/<plugin id>]`), or is a React hook; sends no server write | `use<Thing>.tsx`, `.tsx` even without JSX |
| `srvkit/` | touches `node:*`, `Bun`, `process.env`, a secret, or a server SDK | camelCase file, PascalCase class |
| `ui/` | renders JSX or defines a look (`Recipe/`, a lib's `tokens.css`), not bound to one model; sends no server write | PascalCase component, camelCase sidecar, `Recipe/<name>.ts` |
| `plugin/` | a build- or CLI-time `AkanPlugin` | `<name>.plugin.ts`, registered in `akan.config.ts` |
| `native/` | a native plugin the app or lib owns — its page API reached only through a `webkit/` hook (`runtimeRule`) | `native/<id>/` |

- Hooks return a named object of async closures, never a tuple.
- Recipes live in `ui/`: `webkit/` hooks are `"use client"`, and `common/` cannot import `akanjs/ui`.
- A layer-root `index.ts` is generated; a `ui/<Folder>/index.tsx` building a namespace is hand-written (a generated
  barrel holds only `export *` lines). `ui/<Folder>/index_.tsx` is the `"use client"` + `lazy()` boundary beside a
  server-safe `index.tsx` — merging the pair breaks RSC.

- **No `//!` or `/*!` in browser-reachable code** (`ui/`, `webkit/`, `common/`, `page/**/*.tsx`, `*.constant.ts`,
  `*.store.ts`, module components; `no-bang-comment-in-client`) — Bun keeps both through minification. Use `// FIXME:`.
