---
"akanjs": patch
---

fix(signal): a bare value for an array argument is refused over HTTP and WebSocket

An endpoint declaring `tags: [String]` and sent `"a"` handed its handler the string `"a"` where it expects a list: the
primitive parser read the lone value as one item and returned it unwrapped. It now answers 400 `invalidArgument`,
as a model argument and a filter already did. A repeated query string (`?tags=a`) is always read as a list, so
`fetch` and the generated client are unaffected; a hand-written body must send `["a"]`. MCP still lifts a lone value
into a one-item list, since models send a bare value for an array.
