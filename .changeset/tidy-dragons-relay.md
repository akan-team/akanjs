---
"akanjs": patch
---

Clamp relayed WebSocket close codes to the sendable range so the gateway no longer crashes with InvalidAccessError on bun >= 1.4 when a peer disappears without a close frame (code 1006).
