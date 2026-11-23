---
"akanjs": minor
---

A `query`, `mutation`, `process` or `resolveField` handler can return a constant instance with an `.optional()`
field left unset (`new cnst.X().set({ … })`). The instance types that field `T | null`, which the return contract
used to refuse because it expected `T | undefined`, so a scalar with an optional field could not be returned from
its own query. The new `ServerReturnModel<T>` (`akanjs/constant`) is that contract and accepts `null` there; a
required field still refuses `null`, and the client-side types are unchanged. No upgrade step is needed.
