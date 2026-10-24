---
"akanjs": patch
---

A cache hit on a `query` declaring `{ cache }` loads each relation in the answer from its stored id, as the miss that filled the entry did: a required relation, an optional one, a list of them, and those inside an embedded scalar. In the 3.1.0 release candidates a hit read every stored id as an empty related model, so a required relation answered 404 `base.error.relationNotFound` and an optional one or a list answered `null` or `[]`.

A plain object in a cached answer that carries the key the cache marks its own values with, `"\u0000akan"` (an `Any` field relaying client JSON, say), now reads back on a hit exactly as it was written. In the release candidates a hit could revive it as a `Map`, a date or bytes, or replace it with the object under its `fields` key.
