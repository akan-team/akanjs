---
"akanjs": patch
---

A `query` declaring `{ cache: <ms> }` now answers a cache hit exactly as the call that filled it. The entry was plain JSON, which spells a `Map` `{}`, bytes an index map and a date a string, so a hit on a model with a `Map` field answered 500 (`value.entries is not a function`), a `Binary` return came back as an object of indexes instead of base64, and every `resolveField` on a hit received a plain object — no model methods, dates as strings — where the miss handed it the model. The entry now keeps Maps, bytes and dates, and a hit rebuilds each value the handler returned as a model instance as the endpoint's declared return model, so `resolveReturn` and `resolveField` see the same shape on both paths. What is cached and for how long is unchanged; entries written before the upgrade are read as before until they expire.
