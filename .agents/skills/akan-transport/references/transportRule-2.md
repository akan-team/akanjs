<!-- akan:generated -->

## Mutation HTTP Verb

- A `mutation` is `POST`. `{ method: "PATCH" | "PUT" | "DELETE" }` moves it, and one path may carry several verbs
  — a `query` GET and a `mutation` POST on the same custom `path` are mounted side by side. Two endpoints claiming
  the same path **and** verb fail the boot rather than silently shadowing one another.
- Reach for it only when a foreign wire protocol forces the verb (a client you cannot change that sends
  `PATCH /rest/v1/<table>`). Akan's own `fetch.*` client, the OpenAPI document, and the API explorer all follow
  whatever is declared, so nothing needs restating per caller.
