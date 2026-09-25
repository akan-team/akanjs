---
"akanjs": patch
---

Render a `Map` field in the API explorer instead of crashing the page.

A Map field's `modelRef` is the `Map` constructor itself — it belongs to no registry, and the value type lives in
`of`. `Signal.Object.Detail` handed that constructor to `ConstantRegistry.getModelName`, which threw
`No ref name for modelRef: function Map()`, so every model carrying one took down `<Signal.Doc.Zone />` on render.
It now labels the column `Map` and leaves the existing `⇒ <value type>` beside it.

The request and response examples had the same blind spot one layer down: they walked `Map[FIELD_META]`, which is
`undefined`, so an endpoint whose body or return carried a Map threw before the sample JSON was built. A Map now
serializes into the example as the string-keyed object it is on the wire — `{ "key": <value example> }`.
