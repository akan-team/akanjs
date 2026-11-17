---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

Under `clientRuntime: "route"`, a production page now loads the endpoint descriptors and stores of only the modules its client code names. Before, a client module importing `fetch` or `st` from a `client` barrel brought every module of that app or lib. With `"all"`, the default, every page loads what it loaded before.

- `akan build` reads each client file of the app and its libs. Where every `st.use.<key>()`, `st.do.<action>()`, `st.slice.<name>`, `fetch.<endpoint>()` and `sig.<module>` names something it can tell at build time, the file takes `fetch` and `sig` from `lib/usePage.ts`, `st` from `akanjs/store` (the tab's one store, the object a scope's `lib/st.ts` exports), and imports the `lib/__client/` pieces of the modules those names belong to. A `*.store.ts` file gets its own module's descriptors and those of the modules its model depends on.
- A file that picks a name at run time (`st.do[name]()`), or names something no generated piece answers, imports the app's whole runtime instead, as do the framework components that reach a model by a computed name (`Load`, `Model`, `Data` and the others importing `akanjs/ui/modelRuntime`). The whole runtime is now assembled from the same pieces (`lib/__client/_useClient.ts`, `lib/__client/_st.ts`), so a page holding both a piece and the whole runtime carries each descriptor once. A `*.store.ts` file that picks a name at run time imports every descriptor and every other module's store piece: the store root imports that file, so it cannot import the root.
- A lib file naming a lib module loads the app's piece of it, so a store the app extends arrives with the app's additions. The lib's own store file of that model is the exception: the app's piece is what loads it.
- A store piece whose model holds a file loads the upload module's descriptors first, so the piece alone has its upload action (`st.do.upload<Field>On<Model>`).
- An app store that extends a lib store and has no signal of its own loads the upload module's descriptors first too.
- An import that also takes a `client` barrel's default export (`import Kit, { st } from "@apps/<app>/client"`) is left as written and loads the whole runtime.
- An app store that extends a lib store answers what it answers under `"all"` whichever pieces a page loads and in whatever order: a default both declare is the lib's, an action or a `set<Key>` both declare is the app's. The store runtime itself is unchanged.
- The development server loads what a production page loads: a client module takes the pieces of the modules it names there too, so a name a route misses shows while you work, and the error for a store key the page has not loaded names the module whose store declares it.
- An app not yet synced to `lib/__client/_useClient.ts` and `_st.ts`, or whose module names cannot be read from source, builds as `"all"`, and the build says which of the two happened and names the sync to run. Under `"route"`, `akan sync` warns when it cannot read a scope's modules, and `akan build --write false` warns that it uses the `lib/__client/` files as they were last written.

**Upgrading.**

Nothing to do under the default `"all"`. Under `"route"`, the `lib/__client/` files an earlier release wrote must be written again: `akan build` syncs the app and every lib it mounts before it builds, so they are; a build run with `--write false` and a lib no built app mounts need `akan sync <app-or-lib>` once. Then check the app's pages. What an earlier release said about `"route"` still holds, with one change: a client module importing `fetch` or `st` no longer brings its whole app or lib. Code that reads another module's state without naming it, through `akanjs/store`'s own `st` or from a file outside `apps/` and `libs/`, finds it only where a client module on the route names that module.
