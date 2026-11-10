---
"akanjs": patch
---

The `Err` that `makePageProto` returns has a named type, so the declaration every app's `useClient` emits no longer spells out the class shape for `Err` and each of its status classes. `akanjs/client`'s declaration of `makePageProto` drops from about 24,000 lines to about 30.

`new Err(...)`, `Err.is`, `Err.fromJSON` and `instanceof Err` type as before, on `Err` and on each status class (`new Err.NotFound(...)`, `Err.NotFound.is(...)`). The statics `Err` inherited from `Error` — `captureStackTrace`, `prepareStackTrace`, `stackTraceLimit` and `isError` — are no longer on its type; call them on `Error`.
