---
"akanjs": patch
---

`getAccount()` and the idempotency key's caller read `Authorization` with `bearerTokenOf`, the grammar the account layer and `/mcp` already use.

Upgrade note: on the server, a header without the `Bearer` scheme, or with anything after the token, no longer names a signed-in account to `getAccount()`, and an idempotent mutation sent with one by a caller no account names now runs every time, as a signed-out call does, instead of replaying a kept answer. The endpoints never took such a header as a credential.
