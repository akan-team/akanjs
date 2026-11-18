---
"@akanjs/devkit": patch
---

A route no longer preloads the client files of exports it does not render.

`akan build` lists, per route, the `"use client"` files to preload and to count as Route JS. It walked every import of each server file the route reaches, so a server component file with several exports — a `*.View.tsx`, a `*.Unit.tsx`, a `ui/` file — put the client files of all its exports on every route rendering one of them, and a framework file such as `akanjs/ui`'s `Model` put every wrapper it can load on each route using one.

The list now starts at the route's page and layouts and follows, for each export asked of a server file, only the imports that export's declaration reads, through the file's other declarations. A file's bare imports and top-level statements still count for every route reaching the file, a namespace handed on as a value (`components={Model}`) and `export *` count whole, and a CommonJS file is read as before.

Only the preload and Route JS list narrows. Every client file is still built and in the manifest, so one this read misses loads when the page asks for it; the route runtime plan and the dictionary per route keep the wider list. `akan start` (development) is unchanged. No upgrade step.
