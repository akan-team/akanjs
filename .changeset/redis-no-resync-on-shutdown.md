---
"akanjs": patch
---

A server shutting down no longer tells its `pubsub` rooms to resync, or resubscribes to Redis, when the Redis WebSocket adaptor's subscriber reconnects just as the shutdown begins. Its clients used to get `resync` frames, and run `onResync`, for up to a second before the server closed their sockets.
