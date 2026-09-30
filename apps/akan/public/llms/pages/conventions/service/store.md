# service.store.ts

- Source: /conventions/service/store
- Mirror: /llms/pages/conventions/service/store.md
- Section: conventions
- Category: Service
- Priority: P1

## Headings

- service.store.ts (#service-store)
- State The Screen Shares (#state)
- An Action Returns Nothing (#actions)
- Calling The Endpoint (#fetch)

## Content

service.store.ts

`<service>.store.ts` holds the client state and actions of a service module. Most service modules never fill it, so it is the one file in the folder you will probably not need.

Fill it only when several components share a value, or a screen needs an action that calls the module's endpoint.

Words used on this page

Term

- state: A value the store holds. A component that reads a key re-renders when that key changes.

- action: A method of the store class. Components call it as `st.do.<action>()`.

- st.use, st.do: How a client component reads a key (`st.use.<key>()`) and runs an action (`st.do.<action>()`).

- model store: A store bound to a model's signal, `store(sig.<model>, …)`. Lists, forms and CRUD are generated.

- service store: A store bound to a plain name, `store("<name>" as const, …)`. Nothing is generated from a model.

How many service modules have one

Four of the eight service modules in this workspace have a store, and two of those four are still the empty scaffold:

Service module

What its store holds

- libs/util/lib/_util: The map viewport and the notification permission, plus two map actions.

- libs/shared/lib/_shared: No state. Only the `login` and `logout` actions.

- apps/akan/lib/_akan: The empty scaffold.

- apps/minimal/lib/_minimal: The empty scaffold.

The other four — `_doc`, `_localFile`, `_security` and `_oauth` — have no store file at all.

What a service store does not get

A model store is built from its signal's slices, so list, form and CRUD state arrive without code. A service store is bound to a name instead of a model, so it has only what you declare, plus a reader and a setter for each key.

What exists

model store — store(sig.<model>, …)

service store — store("<name>" as const, …)

- Generated from the model's slices

  - <model>List · <model>Insight: A list and its insight for every slice.

  - pageOf<Model> · limitOf<Model>: Pagination state for every slice.

  - <model>Form · set<Field>On<Model>: The edit form, with one setter per field.

  - create<Model> · remove<Model>: CRUD actions that call the generated endpoints.

- Comes with every key you declare

  - st.use.<key>(): Subscribes a component to that one key.

  - st.do.set<Key>(value): A setter for the key, unless the key is `search`/`computed` or an action has that name.

- Written by you

  - <action>(): Methods in the class body. Besides the key setters, a service store has no other actions.

Exists

Not there

The skeleton

`akan create-service <name>` writes the store empty, exactly like this one:

**The two comments stay.** State goes inside the factory and actions go in the class body. An empty file tells the next reader nothing else, so deleting them removes its only hint.

**It is bound to a name.** The first argument is the module name `"minimal" as const`, where a model store passes `sig.<model>`.

State The Screen Shares

A key earns a place here when more than one component reads it. A map's viewport is the clearest case: the map draws it, a control panel edits it, a list filters by it, and none of them owns it.

The util library keeps its viewport in its service store:

**Each key is its own subscription.** A client component that calls `st.use.mapZoom()` re-renders when `mapZoom` changes, and for nothing else.

**Each key also gets a setter.** The map writes back with `st.do.setMapZoom(zoom)`, so a plain write needs no action.

**Derived work lives on the scalar.** `Coordinate.getBounds` is a static on the constant, so the server can call it too. The store only decides when to run it.

**The model store's state builders work here too.** `persist`, `session`, `search` and `computed` behave exactly as in a model store. model.store.ts, linked at the bottom of this page, covers them.

An Action Returns Nothing

Every method of a store class is called as `st.do.<action>()`, typed `void` or `Promise<void>`. A value you return never reaches the caller, so write it into state with `this.set()` instead.

The first action below shows the mistake and its fix. The second is a real action from the same store:

**Write, do not return.** The component that needs `notiPermission` reads it with `st.use.notiPermission()`.

**A bare guard is fine.** `if (!result) return;` ends the action early without a value, which the lint rule allows.

Reading and writing inside an action

Method

- this.set(state): The only way a value leaves an action. An object merges shallowly; a function edits an immer draft. — Example: `this.set({ mapZoom: 8 });`

- this.get(): Returns the current state. Use it when a value may be missing. — Example: `const { mapZoom } = this.get();`

- this.pick(...keys): Returns keys that must exist, and throws if one is `null`, `undefined` or `""`. — Example: `const { mapCenter } = this.pick("mapCenter");`

Which returns are allowed

Return

Allowed

Lint error

- Inside a store class

  - return value;: A value returned from an action. No caller can ever read it.

  - return;: A bare guard clause that ends the action early.

  - (x) => { return … }: A return that belongs to a nested callback.

  - get total() { … }: A getter is not an action.

  - static helper() { … }: A static method is not an action either.

Applies

Does not apply

Errors: let the framework show them

An action never wraps its body in `try/catch`. A failure is one of two kinds, and each has one fixed response:

The server refused

An `Err` the server throws comes back through `fetch` and already shows as a toast in the dictionary's wording. A `catch` that swallows it turns that message into silence.

A client check failed

Show the dictionary key with `msg.error` and return early. Never `throw`.

Calling The Endpoint

A store is the one client file that calls `fetch.*`. Components read with `st.use.*` and write with `st.do.*`, so two buttons that run the same action cannot disagree about what it does.

The shared library's logout action is the whole shape:

Almost every store action follows the same three steps:

**Call the endpoint** with `await fetch.<endpoint>(…)`.

**Keep the result** with `this.set({ … })`. Logout keeps a token, so it calls `setAuth` instead.

**Tell the user or the router**, with `msg.success("<key>")` or `router.refresh()`.

A body much longer than this is usually a decision the service should have made.

What a store may reach

A store is a client file, so it ships in the browser bundle. It reaches the server only through the generated `fetch`:

Import or call

- Client-safe

  - fetch.<endpoint>(): The generated client from `"../useClient"`, and the store's only way to the server.

  - ../cnst · akanjs/client: Model classes, `router`, `setAuth` and other browser-side helpers.

  - import type { … }: Erased before bundling, so a type from a server file is fine.

- Server-side or route-only

  - *.service · *.signal · *.document · *.dictionary: Server modules. One value import drags their whole graph into the browser bundle.

  - srvkit/ · ../srv · ../db · ../sig · ../dict: Server-only folders and barrels, plus `option`, `useServer` and any `server` entrypoint.

  - fetch.init<Model><Suffix>(): Loaded by the route before the first byte. The client reloads via `st.do.init<Model><Suffix>()`.

**Reach another module's store through `RootStore`.** Write `import type { RootStore } from "../st"`, then call its actions or `.set({ … })` its state through `(this as unknown as RootStore)`, as the logout above does.

**Keep it `import type`.** Every store is mixed into one root at runtime, so the cast only tells the type what `this` already is; a value import from `st.ts` would be a cycle.

Related pages

- model.store.ts — The `persist`, `session`, `search` and `computed` builders, and the state a model store generates.

- service.signal.ts — Declares the endpoints that `fetch.*` calls.

- Service.Zone.tsx — The client component that reads this store's keys.

- Service.Util.tsx — The control that runs one of this store's actions.

## Code Examples

### apps/minimal/lib/_minimal/minimal.store.ts

```ts
import { store } from "akanjs/store";

export class MinimalStore extends store("minimal" as const, () => ({
  // state
})) {
  // action
}
```

### libs/util/lib/_util/util.store.ts

```ts
import { store } from "akanjs/store";

import * as cnst from "../cnst";

export class UtilStore extends store("util" as const, () => ({
  notiPermission: "default" as NotificationPermission,
  mapCenter: { type: "Point", coordinates: [127.0016985, 37.5642135] } as cnst.Coordinate,
  mapZoom: 8,
  mapBounds: { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 },
  mapPanControl: true,
})) {
  fitToScreenByCoordinate(...coordinates: cnst.Coordinate[]) {
    this.set({ mapBounds: cnst.Coordinate.getBounds(...coordinates) });
  }
}
```

### libs/util/lib/_util/util.store.ts

```ts
async refreshNotiPermission() {
  const notiPermission = await Notification.requestPermission();
  this.set({ notiPermission }); // [!code ++]
  return notiPermission; // [!code --]
}

fitToScreenThroughCenterAndZoom(locations: cnst.Coordinate[], explicitZoom?: number) {
  const result = cnst.Coordinate.computeCenterAndZoomFromLocations(locations);
  if (!result) return;
  this.set({ mapCenter: result.center, mapZoom: explicitZoom ?? result.zoom });
}
```

### libs/shared/lib/_shared/shared.store.ts

```ts
import { router, setAuth } from "akanjs/client";
import { store } from "akanjs/store";

import * as cnst from "../cnst";
import type { RootStore } from "../st";
import { fetch } from "../useClient";

export class SharedStore extends store("shared" as const, () => ({
  // state
})) {
  async logout() {
    const { jwt } = await fetch.signoutUser();
    setAuth({ jwt });
    (this as unknown as RootStore).set({ me: new cnst.Admin(), self: new cnst.User() });
    void (this as unknown as RootStore).getSelf({ jwt });
    router.refresh();
  }
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

