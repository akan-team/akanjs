---
"akanjs": patch
---

Normalize unsendable relayed WebSocket close codes to 1001 so Bun's global client WebSocket.close no longer throws InvalidAccessError at the gateway's client-to-upstream relay when a peer disappears without a close frame (code 1006). The upstream-to-client relay applies the same normalization defensively.
