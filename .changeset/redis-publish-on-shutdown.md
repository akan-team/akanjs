---
"akanjs": patch
---

**A graceful shutdown now lets the cross-server events the Redis WebSocket adaptor is still sending reach Redis, within a second.** The adaptor closed its publisher with ioredis `disconnect()`, which returns while the socket is still writing, and the process exits right after a shutdown, so a backlog of events it had published never reached Redis. Nothing was logged, and the other servers' clients missed those events without being told to resync. It now sends `QUIT`, which Redis answers only after every command ahead of it, and disconnects once that answer is in or the link closes. A link that stalls or is too slow to take the backlog gets one second, shared with the drain of the adaptor's own buffer, which had no limit before. Running out of it logs a warning that events still being sent may be lost.
