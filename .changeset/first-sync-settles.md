---
"@akanjs/devkit": patch
---

The first `akan sync` of a new checkout writes the client runtime files a second one used to, so the first production build of a clean tree loads its routes per module.

- **The files under `lib/__client` are written after every scope's `lib/cnst.ts`.** They were written beside it, and on a tree with no generated files a module whose signal names another lib's constants as `cnst.<lib>.X` got a fetch file that imports the scope's whole constant barrel. A build of that tree measured the per-module runtime as larger and kept the whole client runtime on every route. On a real workspace of nine libs, 21 fetch files were written that way by the first sync and none by the second; the first build of a clean tree said `0 routes load per module, 235 keep the whole runtime`, and now says `235 routes load per module`, as its second build did.
- **A lib reached only through another lib is a dependency from the first sync.** When an app or lib imports `@libs/b` and `b` imports `@libs/c`, its generated barrels name `c` at once. Before, the first sync left `c` out and a second sync added it, having found the import in the files the first one generated. `akan.app.json` lists such libs too, so their pages and assets are synced the first time.

A CI job that builds a clean checkout shipped the larger build. Running `akan sync <app>` before `akan build` was the way around it and is no longer needed.

Not changed: the order generated files list an app's libs in still depends on the order their scans finish in, so the first and the second sync of a new tree can list the same libs in a different order.
