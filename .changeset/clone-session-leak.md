---
"akanjs": minor
"@akanjs/devkit": patch
---

Security: a server-side call to another server no longer carries the visitor's session. Server code answering a visitor's request used to send the visitor's `Authorization` header or auth cookie, and their `x-real-ip`, with every call it made, so a `fetch.clone({ origin })` toward another origin handed that server the visitor's token for this one. Now only a call to this server forwards them; a clone toward another origin, any clone of one, and a call given another `{ origin }` send only the client's own `jwt`, the one `fetch.clone({ jwt })` was given. Upgrade note: a server that relied on the forwarded session now receives a signed-out call; give the clone the token it should send (`fetch.clone({ origin, jwt })`).
