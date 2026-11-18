---
"@akanjs/devkit": patch
---

A route no longer loads a model's client reference because one of the app's stores names that model.

`akan build` reads each route's server modules for the models they hand to client components (`fetch.init<Model>`, `view<Model>`, `edit<Model>`, a slice) and preloads those models' reference files on the route. The generated root layout imports every store of the app so the server holds them, which made each store, and every file a store or a signal imports, a server module of every route. A store calling `fetch.view<Model>` in an action, or reading a slice, therefore put that model's reference on every page of the app, and one picking a `fetch` name at run time put every model's there.

- The read now follows only what a route's own layouts and page import. The root layout's store imports are left out of it.
- A `*.store.ts` file reached any other way hands nothing over: its actions run in the browser, where the code calling them already loads the model's store and descriptors.

A route still loads the reference of every model its page, layouts and the server components they render hand over. No upgrade step.
