---
"akanjs": patch
---

A plain GET on the websocket path (`/api/ws` by default) now answers `426 Upgrade Required` with `Upgrade: websocket` and `Connection: Upgrade`, where it answered `500 Failed to upgrade to WebSocket`, so a crawler, an uptime probe or a person opening the URL no longer counts as a server failure in logs and 5xx alerts. Behind the gateway the same request is answered at the gateway, before it opens a socket to a replica. A handshake still opens the socket, one from another site's Origin still answers 403, and 500 is left for a handshake the server still refuses.
