---
"akanjs": patch
---

Three malformed requests now get the refusal a well-formed mistake gets, instead of a 500 or a stray answer.

- A WebSocket frame whose `key` names a member of `Object.prototype` (`constructor`, `toString`, `valueOf`, `hasOwnProperty`, `__proto__`) answers 404 `routeNotFound`, like any other unregistered key. It used to find that member in the route table and answer 500 with an error log line, `{}` or `"[object Undefined]"`.
- A WebSocket frame whose `data` is not an array answers 400 `invalidMessage`. A missing or `null` `data` used to answer 500 with an error log line, and a string had its characters read as the arguments.
- An MCP `POST` whose JSON body is `null` answers 400 with a JSON-RPC `invalidRequest` error instead of throwing.
