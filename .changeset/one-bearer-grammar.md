---
"akanjs": patch
---

The `/mcp` gate, the account layer's `resolveJwt`, machine tokens, the ops channel, the log stream and the claims an MCP App view is handed read `Authorization` with one grammar, `bearerTokenOf` from `akanjs/common`: a case-insensitive `Bearer`, one or more spaces, then one token and nothing after it.

Upgrade note: a header that carries anything after the token (`Bearer <token> extra`), separates the token with a tab, or leaves out the scheme now reads as no credential to all of them; some used to take its first word and others the whole rest. An `AKAN_LOG_STREAM_TOKEN` holding whitespace, which no bearer header can carry, now leaves `/_akan/app/logs` off with an error at boot.
