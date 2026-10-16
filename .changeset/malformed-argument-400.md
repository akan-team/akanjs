---
"akanjs": patch
---

An HTTP or websocket call whose argument fails to parse — a non-numeric `Int`, a value outside its `enumOf`, a required one left out — answers 400 `base.error.invalidArgument` with `{ name }`, which the client translates, instead of a generic 500. The account guards still run first, so an unauthenticated call with a malformed argument answers 401/403 as before.

Upgrade note: a client or test that expected a 500 for a malformed argument now gets a 400.
