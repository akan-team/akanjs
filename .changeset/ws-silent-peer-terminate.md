---
"akanjs": patch
---

A server-side `WsClient` and the tunnel agent reconnect within one heartbeat of a peer going silent again. Since Bun 1.4.4, `WebSocket.close()` waits for the peer's Close frame and gives up only after 30 seconds, so a link that died without a FIN stayed down that much longer before the reconnect began. Both now `terminate()` the silent socket; in a browser, `WsClient` still calls `close()`.
