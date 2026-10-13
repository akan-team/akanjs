---
"akanjs": patch
---

A websocket that closes while a subscribe is still running no longer leaves the room joined. The close left every room the socket held, and the subscribe then finished and joined one more, so the live sync hub, the pub/sub adaptor and the gateway's room table each counted a subscriber that would never leave, and every later write was still routed to that room. Such a subscribe now joins nothing, and the cleanup its handler registered with `ws.on("unsubscribe" | "disconnect", …)` runs at once — as does one a `message` handler registered while its socket closed.
