---
"akanjs": patch
---

Reading the client address from a forwarded header no longer stalls the server on a crafted hop. `IpLiteral.parse` matched a bracketed IPv6 hop with a pattern that backtracked quadratically, so an `X-Forwarded-For` or `X-Real-IP` entry of `[` and a long run of colons kept the event loop busy for about 100 ms per 16 KB of header, on every request that carried it. The bracket is now matched in linear time and the colon checked apart; every address parses as before.
