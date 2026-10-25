---
"akanjs": patch
---

- **Security: the account layer reads `Authorization` as `/mcp` does.** `resolveJwt` takes the token with `bearerTokenOf`, so a header carrying anything after it (`Bearer <token> extra`) reads as signed out. The release candidates took its first word there: such a call ran signed in while `/mcp`'s gate, reading no token, skipped its audience, scope and `verify` checks.
- **`cred` is masked as a word, not a substring.** `Logger.isSecretKey` matches `credential`, and `cred` or `creds` as a word of a name (`regcred`, `awsCreds`, `AWS_CREDS`). `credits`, `usedCredit` and `creditBalance` stay readable in log data and attrs, and a server env profile no longer strips or refuses a value under such a name.
- **Security: a server-side call's transport failure stays on this server.** When a call reached no server or got a proxy's own page, its `base.error.serverUnreachable` (or `serverUnavailable`, `gatewayTimeout`, `unexpectedResponse`) carried the runtime's message (`getaddrinfo ENOTFOUND <internal host>`) or the page as `details`, and an endpoint that let it propagate sent that to its caller. The server now logs it at `warn` with the call's origin and path; the error keeps `details`, but its `toJSON()`, which every transport answers with, leaves it out.
