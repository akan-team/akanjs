---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": patch
---

A server-rendered page starts from a small page runtime, the first step toward loading a model's endpoint descriptors and store in the browser only on the routes that use them.

- Each client entry of a server-rendered page starts from `lib/usePage.ts` (`usePage`, `msg`, `Err` and a fetch client carrying only the framework's own descriptors, such as `ping`, from `lib/__client/_base.fetch.ts`) instead of `lib/useClient.ts` and `lib/st.ts`. A client module that imports `fetch` or `st` from an app or lib `client` barrel still brings that scope's descriptors and stores, and a lib's barrel brings that lib and the libs under it.
- The framework components that reach a store, an endpoint or a registered constant by a name they compute (`Load`, `Model`, `Data`, `Signal`, `Constant.Doc` and the relation fields) import an empty module, `akanjs/ui/modelRuntime`. A route build keeps the app's `lib/useClient.ts` and `lib/st.ts` in every client entry reaching it, so a page rendering one of them loads the app's whole runtime before the component runs. A test in `akanjs` fails when a `ui` file reaches a model that way without importing it.
- Server rendering, CSR bundles (MCP App views included) and native apps keep loading the whole runtime. The development server narrows imports from `akanjs/ui` as a production build does, so a missing import shows there too.
- An app whose generated files predate `lib/usePage.ts` or `lib/__client/_base.fetch.ts` builds with the whole runtime on every page until it is synced.
- `StoreBootstrap.importLines` and `StoreBootstrap.source` in `@akanjs/devkit` take an optional scope, `"whole"` (the default) or `"page"`.

**Upgrading.**

What a page stops loading, and what to check for, is in the upgrade note of the entry that makes every app load per route.
