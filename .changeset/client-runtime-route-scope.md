---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": patch
---

An app can set `clientRuntime: "route"` in `akan.config.ts` to load a model's endpoint descriptors and store in the browser only on the routes that use them. With `"all"`, the default, every page loads what it loaded before.

- Under `"route"`, each client entry of a server-rendered page starts from `lib/usePage.ts` (`usePage`, `msg`, `Err` and a fetch client carrying only the framework's own descriptors, such as `ping`, from `lib/__client/_base.fetch.ts`) instead of `lib/useClient.ts` and `lib/st.ts`. A client module that imports `fetch` or `st` from an app or lib `client` barrel still brings that scope's descriptors and stores, and a lib's barrel brings that lib and the libs under it.
- The framework components that reach a store, an endpoint or a registered constant by a name they compute (`Load`, `Model`, `Data`, `Signal`, `Constant.Doc` and the relation fields) import an empty module, `akanjs/ui/modelRuntime`. A route build under `"route"` keeps the app's `lib/useClient.ts` and `lib/st.ts` in every client entry reaching it, so a page rendering one of them loads the app's whole runtime before the component runs. A test in `akanjs` fails when a `ui` file reaches a model that way without importing it.
- Server rendering, CSR bundles (MCP App views included) and native apps keep loading the whole runtime. The development server narrows imports from `akanjs/ui` as a production build does, so a missing import shows there too.
- An app whose generated files predate `lib/usePage.ts` or `lib/__client/_base.fetch.ts` builds as `"all"` until it is synced.
- `StoreBootstrap.importLines` and `StoreBootstrap.source` in `@akanjs/devkit` take an optional scope, `"whole"` (the default) or `"page"`.

**Upgrading.**

Nothing to do: with the default `"all"` the build output is unchanged. Before setting `"route"`, check client code for what the switch stops loading on a page: a client module that reaches a model through the framework's base `st` or `fetch` by a string without importing the app's or a lib's `client` barrel; a component library built on `akanjs/store`'s `st` that computes store names; a module whose import-time side effect other pages relied on because a store imported it; and code outside React that reads `st.get().<key>` of a store no module on the route imports, which is `undefined` there, since a store's initial state and persisted keys now appear when its code loads. An app store that extends a lib's store adds its actions, state and slices only on a route that loads the app's runtime, so code using them imports `st` from the app's `client` barrel, not the lib's.
