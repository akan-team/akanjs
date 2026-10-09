---
"akanjs": minor
"@akanjs/cli": patch
---

`Signal.Doc` and `Constant.Doc` render straight from a server page. Each member crosses the client boundary on its own, and `fetch` is optional everywhere in `Signal`: it defaults to the app's registered runtime, so `<Signal.Doc.Zone refName="product" />` needs no `"use client"` wrapper. `Signal.Doc.Explorer({ include?, exclude?, libs?, groupBy?, defaultRefName? })` lists every mounted signal in a sidebar and mounts each one on first open. The Signal docs' toolbar, modal and section labels are translated.

`Constant.Doc.Zone` / `Print` take `include`, `exclude` and `libs`, and narrowing any list narrows the rest: a left-out `scalars` becomes the scalars the shown models embed, a left-out `enums` the enums their fields use. Upgrade note: an empty list now means none — `models={[]}` used to show every model; leave the prop out for that. `getConstantSchemaDoc` is exported from `akanjs/ui`.

Every constant and signal records the app or lib that registered it (`ConstantRegistry.getOrigin(kind, key)`, `SerializedSignal.origin`), chained when an app extends a lib module (`["shared", "sceny"]`). The generated `lib/cnst.ts` and `lib/sig.ts` pass the scope name; run `akan sync` to regenerate them. `groupBy="lib"` puts one section, one diagram and one sidebar group per library, the app first, and a model shows "sceny (extends shared)".

The `Date` scalar's example value is a fixed instant, so a server-rendered response example no longer mismatches its hydration.
