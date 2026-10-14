---
"akanjs": patch
---

`getAccount()` reads `Authorization` with `bearerTokenOf`, the grammar the account layer and `/mcp` already use.

Upgrade note: on the server, a header without the `Bearer` scheme, or with anything after the token, no longer names a signed-in account to `getAccount()`; the endpoints it calls never took it as one.
