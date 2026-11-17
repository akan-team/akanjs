---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

A production page now loads the endpoint descriptors and stores of only the modules its client code names. Before, a client module importing `fetch` or `st` from a `client` barrel brought every module of that app or lib.

- `akan build` reads each client file of the app and its libs. Where every `st.use.<key>()`, `st.do.<action>()`, `st.slice.<name>`, `fetch.<endpoint>()` and `sig.<module>` names something it can tell at build time, the file takes `fetch` and `sig` from `lib/usePage.ts`, `st` from `akanjs/store` (the tab's one store, the object a scope's `lib/st.ts` exports), and imports the `lib/__client/` pieces of the modules those names belong to, each by a name it hands to `loadedAfter` from `akanjs/base`, so the piece's chunk loads first however the build splits the code. A `*.store.ts` file gets its own module's descriptors and those of the modules its model depends on, and no store piece: a file naming a store loads the stores that store's file names.
- A file that picks a name at run time (`st.do[name]()`), or names something no generated piece answers, imports the app's whole runtime instead, as do the framework components that reach a model by a computed name (`Load`, `Model`, `Data` and the others importing `akanjs/ui/modelRuntime`). In development the whole runtime is assembled from the same pieces (`lib/__client/_useClient.ts`, `lib/__client/_st.ts`); in a build a client entry that needs every module keeps `lib/useClient.ts` and `lib/st.ts` as before, and the files only such entries reach are left as written. A `*.store.ts` file that picks a name at run time (spreading into the object given to its own `this.set` is not one) makes every file naming its store load the whole runtime.
- A lib file naming a lib module loads the app's piece of it, so a store the app extends arrives with the app's additions. The lib's own store file of that model is the exception: the app's piece is what loads it.
- A store piece whose model holds a file loads the upload module's descriptors first, so the piece alone has its upload action (`st.do.upload<Field>On<Model>`).
- An app store that extends a lib store and has no signal of its own loads the upload module's descriptors first too.
- An import that also takes a `client` barrel's default export (`import Kit, { st } from "@apps/<app>/client"`) is left as written and loads the whole runtime.
- An app store that extends a lib store answers what it answered before, whichever pieces a page loads and in whatever order: a default both declare is the lib's, an action or a `set<Key>` both declare is the app's. The store runtime itself is unchanged.
- The development server loads what a production page loads: a client module takes the pieces of the modules it names there too, so a name a route misses shows while you work, and the error for a store key the page has not loaded names the module whose store declares it.
- An app not yet synced to `lib/__client/_useClient.ts` and `_st.ts`, or whose module names cannot be read from source, builds with the whole runtime on every page, and the build says which of the two happened and names the sync to run. `akan sync` warns when it cannot read a scope's modules, and `akan build --write false` warns that it uses the `lib/__client/` files as they were last written.

**Upgrading.**

The `lib/__client/` files an earlier release wrote are written again by the sync `akan build` runs. A client module importing `fetch` or `st` no longer brings its whole app or lib; what to check for is in the upgrade note of the entry that makes every app load per route.
