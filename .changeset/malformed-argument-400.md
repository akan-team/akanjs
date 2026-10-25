---
"akanjs": patch
---

An HTTP or websocket call whose argument fails to parse answers 400 with `{ name }`, which the client translates, instead of a generic 500: a non-numeric `Int` or a value outside its `enumOf` answers `base.error.invalidArgument` (`"{name} has an invalid value."`), and an argument left out, or sent as `null` where it is not nullable, answers `base.error.requiredArgument` (`"{name} is required."`). A nullable argument takes `null`, and MCP's refusal text is unchanged. The account guards still run first, so an unauthenticated call with a malformed argument answers 401/403 as before.

Upgrade note: a client or test that expected a 500 for a malformed or missing argument now gets a 400.
