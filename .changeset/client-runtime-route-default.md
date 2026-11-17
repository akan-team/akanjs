---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

`clientRuntime` defaults to `"route"`: an app that sets nothing loads, on each server-rendered page, the stores, endpoint descriptors, constants and dictionary texts of the modules that page uses, not every module's. `"all"` still loads everything on every page; it is deprecated and is removed in the minor release after this one.

- `akan build` and `akan start` print one line for an app set to `"all"`: the setting is deprecated, and `akan quality runtime` names the files that would keep its pages on the whole runtime. Nothing else changes for such an app, no error and no exit code.
- A build or development server that cannot use the per-module files (never synced, written by an earlier release, a mounted lib not synced, a module that cannot be read) loads the whole runtime on every page, as `"all"` does, and says so once with the `akan sync` to run. `akan build --write false`, which skips the sync, says its files may be stale.
- `akan quality runtime` lists, after an `akan build`, the routes that load every text of the page dictionary under the file and line that cost it (`[dictionary] <file>:<line> <why>`); `--format json` carries every route. For an app with a build report it no longer prints the `akan.runtime.framework-marker` note, which counted every page importing a framework component that reads models by name; the build's `[reader]` line names the routes that component really holds. The `akan quality` reference page lists every rule the report prints and what to change in app code for each.
- A model's reference, which `fetch.slice`, `fetch.init<Model>`, `fetch.view<Model>` and `fetch.edit<Model>` hand to client components, loads that model's own store. Before, another module's store with a state field named like the model loaded with it.

**Upgrading.**

This is the one upgrade note for the per-route client runtime; the other entries of this release say what was built.

_With no action._ The first `akan build` or `akan start` after upgrading syncs the app and the libs it mounts, writing `lib/usePage.ts` and `lib/__client/` beside the other generated files, and its pages load per module. Add `apps/*/lib/usePage.ts`, `libs/*/lib/usePage.ts`, `apps/**/lib/__client` and `libs/**/lib/__client` to `.gitignore` beside `lib/useClient.ts` and `lib/__lib`. A build run with `--write false` and a lib no built app mounts need `akan sync <app-or-lib>` once; until then the pages load the whole runtime and the build says so. Server rendering, CSR bundles and native apps load everything, as before, and the development server loads what a production page loads. An app with routes to measure bundles its browser code at least twice, where it bundled once; `akan build --verbose` shows each bundle and its time.

_What can break, and how it shows._ A page no longer loads a module that no client file of its route names.

- A store or endpoint reached by a computed name without the app's or a lib's `client` barrel (the framework's base `st` or `fetch` with a string, a component library built on `akanjs/store`'s `st`, a file outside `apps/` and `libs/`) is found only on a route where a client file names that module. Outside React, `st.get().<key>` of such a store is `undefined`: a store's initial state and persisted keys appear when its code loads.
- An app store that extends a lib's store adds its actions, state and slices only on a route that loads the app's runtime, so code using them imports `st` from the app's `client` barrel, not the lib's.
- Top-level code runs only on the pages that name its file. A side effect other pages relied on because a store or a part file (`Memo.Zone.tsx`) imported it must be named by the pages that need it, or moved to where it is used. A member replaced at run time (`Obj.part = other`) is not seen by files that named the original member; read the object whole (pass it on) in the file that depends on the replacement.
- A slice, init, view or edit object written by hand (`{ refName, sliceName, … }`) or deep-copied (`JSON.parse(JSON.stringify(init))`, `structuredClone(init)`, a cache that stores it as JSON) carries no reference to its model, and neither does a slice parameter that is reassigned or has a default value. On a route where no client file names the model, the framework list, view or form finds no store: in development the error names the store's module and this cause, and in production the page shows nothing where the slice is read. `akan quality runtime` does not report this. Take the object from `fetch`, hand it over uncopied or spread (`{ ...init }`), or name the model in a client file of the route (`st.use.<key>()`).
- A model looked up by name (`ConstantRegistry.getDatabase("memo")`) is found only on a page that names it: name it in that file (`cnst.Memo`) or read `cnst` whole there. A registered model's `_`-prefixed member read as a value is `undefined`, where it was `null`; those members are types.
- A `"use client"` component that builds an endpoint's description key from data (`` l(`${module}.signal.${endpoint}.desc`) ``) gets the text on the server and the raw key in the browser: React reports a hydration mismatch and the key shows. Write the key out, or read the text in a server component and pass it down. A text shown once outside React, such as a toast that calls `Translator.translateByLocale`, can wait on `Translator.ready(lang, key)` so a late module's text is not shown as its key.

_How to check._ Run `akan build <app>`, then `akan quality runtime`: it names each file that keeps a page on the whole runtime or the whole dictionary, the line, the reason and the routes. `akan preview <app>` opens the pages and reports what they throw.

_How to opt out._ Set `clientRuntime: "all"` in `akan.config.ts`. It is deprecated and is removed in the minor release after this one, so use it to ship while the files `akan quality runtime` names are changed.
