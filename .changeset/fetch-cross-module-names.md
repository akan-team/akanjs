---
"akanjs": patch
---

The fetch client no longer drops a custom endpoint named like another model's generated CRUD endpoint (`removeX`, `updateX`, `viewX`, …) when that model's slice does not mount the verb. A slice now takes back only the generated handlers it registered itself, so the result no longer depends on which module the client applied first.

When two declarations do claim one `fetch.*` name, the server now refuses to boot and names both (`[DI:fetch]`). That covers a mounted generated endpoint, a slice's `xListInY` / `initXInY`, and a custom query, mutation, pubsub or message, in one module or across two. A pubsub and a message sharing a name are refused too (`[DI:socket]`): the server used to route the socket frame to whichever module mounted last.
