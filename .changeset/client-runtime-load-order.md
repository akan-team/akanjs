---
"akanjs": patch
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

A production build of a workspace with several libs loads its client modules in order, and a page that needs every module weighs what it weighed before.

- Each generated piece exports a name, and a module that needs the piece imports that name and hands it to `loadedAfter` from `akanjs/base`. A piece imported only for its effect could end up in a chunk the importer's chunk did not load first; a store or an endpoint was then read before it existed.
- A store file, and every file a store file imports, loads no store piece. The stores its code names are loaded by each file outside that imports it or names its store, so no store file is defined through a piece that imports it back. Where the importing file is one the build leaves as written (it holds a macro import, or lies outside `apps/` and `libs/`), the page keeps the whole runtime.
- A store spreading a value into the object it gives its own `this.set` (`this.set({ ...patch })`) no longer counts as picking a name at run time. A value or a function handed over whole (`this.set(patch)`, `this.set(update)`) still does, since an updater may read any module's state. `fetch.ws`, `fetch.http`, `fetch.origin`, `fetch.jwt`, `fetch.logger`, `fetch.setJwt`, `fetch.setTimeout`, `fetch.connect`, `fetch.connectOnUse`, `fetch.disconnect` and `fetch.configureWs` are the fetch client's own members, not endpoint names.
- A client entry that reaches a file needing every module keeps the whole runtime, as does an entry held only by pages with such an entry, and one naming a module that more such pages hold than other pages. Their files are left as written, so the page loads the code it loaded before.
- `akan build` checks its output before it serves it: every chunk holding a module that needs a piece reaches the chunk holding that piece, no store file sits in an import cycle with a piece, and no entry built to load pieces reaches a file needing every module. On a failure the build warns once with the two source files named, builds every page on the whole runtime instead and succeeds; the warning is a bug in akan to report. The development server serves each module on its own and checks nothing, so the production build is the guard.
- `akan quality runtime` adds a note, `akan.runtime.framework-marker`, per file that brings a framework component reading models by name (`Field`'s relation fields, `Load`, `Model`, `Data`, `Signal`, `Constant.Doc`) onto a page: the imports from that file to the component, and the pages that load the whole runtime through it.

Nothing to do. A file outside every app and lib that imports a `lib/__client/` piece by hand should import the piece's exported name and pass it to `loadedAfter`; the build's check names it otherwise.
