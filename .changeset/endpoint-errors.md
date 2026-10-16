---
"akanjs": minor
---

An endpoint declares the errors it throws on purpose, by status: `mutation(cnst.Ticket, { guards: [Owner], errors: { 409: ["ticket.error.locked"] } })`.

- OpenAPI documents each declared status as a response in the wire shape every error already answers with (`components.schemas.AkanError`: `error`, `statusCode`, `data`, `details`, `path`, `timestamp`), with `error` enumerating the declared keys and the description carrying each key's message.
- The MCP tool's description gains a line naming each declared status, key and message, since the description is all an agent reads before calling.
- The declaration is checked: a status outside 400–599 or a key that is not `<module>.error.<key>` throws where the endpoint is declared, a key no dictionary defines is warned about at boot, and outside production an endpoint that throws a key its declaration leaves out is warned about once. `base.error.*` is the framework's and is never declared.
- `Err.is(error, ...keys)` narrows a caught value to an Akan error carrying one of those keys, typed against the app's error keys; it reads the `error` field, so an error restored from another server passes too.

The wire format is unchanged.
