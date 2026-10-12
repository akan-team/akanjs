---
"akanjs": patch
---

A response no longer fails when a relation points at a removed document. A relation list leaves the target out, an optional single relation reads `null`, and a required one answers 404 `base.error.relationNotFound` naming the model and the field path instead of an opaque 500. Upgrade note: `SignalContext.loadNested` takes `{ arrDepth }` only and reads a missing target as `null`.
