---
"akanjs": patch
---

A primitive argument (`String`, `Int`, `ID`, `Any`, …) left out of a call, or sent as `null`, now answers 400 `base.error.requiredArgument` (`"{name} is required."`) with `{ name }`, as a required field of a model body already did. It answered `base.error.invalidArgument` (`"{name} has an invalid value."`), which told the caller the value was wrong when there was none. A nullable argument still takes `null`, and MCP's refusal text is unchanged.

Upgrade note: a client or test that matched `base.error.invalidArgument` for a missing primitive argument now gets `base.error.requiredArgument`; the status stays 400.
