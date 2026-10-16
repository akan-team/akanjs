---
"akanjs": minor
---

A model or scalar argument is now checked against the request schema the server publishes, on HTTP, websocket and MCP calls, before the handler runs. Until now a stored model's input passed through unchecked: `{ count: "x" }` or a string where an object belongs reached the service, and failed at save time as a 500 or was stored as sent.

- A field of the wrong JSON type, a value outside its enum, a malformed id, or a required field that is absent or `null` answers 400 `base.error.invalidArgument` / `base.error.requiredArgument`, with `data.name` naming the path (`data.items.2.price`) and `data.expected` what it takes. MCP answers `Invalid field "data.title": expected String.` / `Missing required field "data.title".`
- A key the input does not declare is dropped, so a body can no longer set a field outside its input class (`removedAt`, a role) for a service that forwards it.
- A field with a default may be left out, and a stored model's input keeps an absent field absent, so an app built against an older schema keeps working and an update still sets only what it carries. An embedded scalar is parsed whole, its absent fields taking their defaults.
- Dates arrive as `Dayjs`, as the input type always said, instead of the wire string.
- A primitive argument (`?limit=3`, a path param) keeps its text coercion.
- A document whose enum or `validate` refuses a value now answers 400 `base.error.invalidField` with `{ field }` instead of a 500.

Upgrade note: a caller that sent a body the published schema refused — a numeric string for an `Int`, an `{ id }` object for a relation, a required field left out — now gets a 400. A service that read an undeclared key off its input no longer sees it; declare the field on the input.
