---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

Under `clientRuntime: "route"`, a page whose server component hands a model to a framework component (`Load.Units`, `Load.View`, `Model.New`, `Model.Edit`, `Data.CardList` and the others) now loads that model's store and descriptors, not every module of the app. Before, those components loaded the whole client runtime wherever they rendered. With `"all"`, nothing changes: the build output and what a server sends are what they were.

- `akan sync` writes `lib/__client/<model>.ref.ts` for each model with a signal and `lib/__client/refs.ts` for the app. The generated root layout imports `refs.ts` under `"route"`, and the server then adds the model's client reference to every slice, init, view and edit it hands to a client component, as the optional `_runtime` field of `SliceMeta`, `ServerInit`, `ServerView` and `ServerEdit`. The browser loads the reference, and with it the model's store and descriptors, before the component receiving the object renders: on the first page, inside a streamed part of it, and after a client navigation. A model the app extends loads through the app's store, which loads the lib's first. A reference loads what a client file reading `st.use.<model>` loads: the stores the model's store names come with it, and where that store picks a name at run time, the whole client runtime. On a page that already holds the whole runtime the model's store stays the one store, with its state and subscribers.
- `FetchClient.setModelRuntimes(references)` is the one new static. Only the generated `refs.ts` needs it.
- The framework components that reach a model only through such an object no longer load the whole runtime. `Data.ListContainer`, `Data.QueryMaker`, `Data.RefPicker`, the `Signal` API explorer and `Constant.Doc` still do: they follow a model named by a field or a filter argument, which no object brought. They are loaded on demand, so a page pays for them only where one renders.
- A relation field (`Field.Relation` and the others taking a `slice`) loads the related model through the slice it is given, not the whole runtime.
- A `resets` name on `Model.New`, `Model.Edit` or `Model.View` whose store the page has not loaded is passed over, since there is no state to reset.
- The route table of `akan build` counts, for each route, the reference files of the models its server modules hand over. Where a server module picks a `fetch` name at run time, or takes `fetch` from the `server` barrel, the route counts every model's runtime and the build names the file and the line once.
- A handoff object that carries no reference works as before, wherever the page already holds the model's runtime.

**Upgrading.**

Nothing to do under the default `"all"`. Under `"route"`, run `akan sync <app>` once (an `akan build` does it): until `lib/__client/refs.ts` exists the app builds and serves with the whole client runtime and says so once, naming the sync. Then check pages that render a framework list, view or form of a model from a client component that built the slice, init, view or edit object by hand instead of taking it from `fetch` (`{ refName, sliceName, ... }` written as a literal): such an object carries no reference, so the file must name the model's store itself (`st.use.<key>()`), or take the object from `fetch.slice`, `fetch.init<Model>`, `fetch.view<Model>` or `fetch.edit<Model>`.

A copy of such an object matters too. A spread (`{ ...init }`) or an `Object.assign` of what `fetch` returned keeps the reference. A deep copy does not: `JSON.parse(JSON.stringify(init))`, `structuredClone(init)` and a cache that stores the object as JSON all still work, but leave `_runtime` as an empty object, so on a route where no client file names the model the framework component finds no store. In development the error names the store's module and this cause. Hand the object over uncopied or spread, or name the model in a client file of the route (`st.use.<key>()`).
