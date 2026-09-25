---
"akanjs": patch
---

fix: a `Boolean` argument parses the text the wire actually carries

A query string carries text, so `.search("archived", Boolean)` handed `Boolean._parse("true")` a string and threw
`Invalid Boolean value: true` before the endpoint ran. The framework's own client sits on the other end of that —
`HttpClient.makeUrl` writes `String(value)` — so no caller could reach such an endpoint, hand-written URL or not.
`Int` and `Float` never had the problem because their `parseValue` is `Number(input)`, which absorbs a string;
`Boolean` was the one primitive that compared against `true` / `1` and nothing else.

The normalization lives on the primitive rather than in the search-arg branch, because text is what three separate
paths deliver: `URLSearchParams.get`, a path `.param()`, and every field of a `fileUpload` mutation's `FormData`.
One place to normalize is also one place to keep the accepted set from drifting apart.

`true` / `false` / `1` / `0` are accepted, trimmed and case-insensitive — `str(True)` from a Python client is
`"True"`, and a 500 is a poor answer to it. `""` and `"yes"` are still refused. An empty query value is a question
about nullable search args in general rather than about booleans: `Int` reads `""` as `0` today and `String` reads
it as a legitimate value, so answering it for one scalar alone makes the set less predictable, not more.

`serializeValue` takes the same spellings, since the client serializes an argument before `makeUrl` stringifies it
— a `<select>` value handed to a `Boolean` argument now normalizes on the way out instead of throwing.
