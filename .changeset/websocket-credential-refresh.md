---
"akanjs": minor
---

feat(signal): refresh websocket credentials in-session and re-check pubsub rooms

Handshake credentials now live on `AppWsData` (headers/cookies only). Clients that hold the token in
memory send it with `fetch.setJwt(...)`, which forwards an `__auth` frame; the server swaps the
snapshot synchronously and re-runs each subscribed room's guards, unsubscribing the ones that fail.

Guards should read the caller with `context.get("account")` instead of branching on HTTP vs websocket
transport. Slice-level guards still only wrap generated query/mutation endpoints — a pubsub endpoint
needs its own `guards` if the room itself must be protected.
