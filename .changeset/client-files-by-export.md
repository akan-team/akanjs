---
"@akanjs/devkit": patch
---

A production page loads the exports of a client file it uses, not everything else the file holds.

A workspace file with several exports — a `*.Util.tsx`, a `*.Zone.tsx`, a `ui/` or `webkit/` file — was one module to the bundler, so a page rendering `Memo.Util.Remove` also downloaded what `Memo.Util.Edit` imports. `akan build` now hands the browser bundle each such file as one module per export: a top-level declaration that only builds a value (a component, a function, a constant, a class) becomes its own module with the imports it alone reads, and an importer naming `{ Remove }` follows that module only. A `"use client"` file is likewise built as one entry per export, and a route preloads and counts as Route JS the entries of the exports its server files ask for.

How a file is written does not change: several exports in one file, imported by name or as `Memo.Util.Remove`. What the file does when it loads — a bare import, a call at the top level, anything that is not a plain declaration — stays together in one module that each of its exports loads first.

A file stays one module when it has a top-level `let` or `var`, `export *`, a namespace or a macro import, and so do generated barrels, `lib/__client` pieces, `index.ts` files and `*.constant|dictionary|document|service|signal|store.ts`. A namespace import (`import * as Util`) used as a value still loads every export.

On a real workspace's largest app (236 routes, brotli as served) the JS all routes load fell 9.3% in total, the lightest route went from 363.8 to 290.2 KB and the median from 795.3 to 764.7 KB. The build writes more, smaller files: 1,827 client files against 1,141, and 8.8% more bytes on disk. An app with little to take apart grows by a fraction of a KB per route. `akan start` (development) and the server bundle are unchanged. No upgrade step.
