---
"akanjs": patch
---

On the Redis WebSocket adaptor, Redis now hands a server only the events of the rooms it holds and the changes of the models it holds live rooms for. Both used to go to every server of the app on one channel, `<prefix>ws:broadcast`.

- **A room's events** go out on one of 16,384 channels, picked by a hash of the room id (`<prefix>ws:room:<shard>`). A server subscribes to a shard while it holds a room on it.
- **A change to a live-synced model** goes out on `<prefix>ws:change:<model>`. A server subscribes to it while it holds a live room for that model, so a server with none, a batch server included, receives no change for it.
- **A subscribe is acknowledged once Redis has confirmed the SUBSCRIBE** for its channel, so an event another server publishes after the ack still arrives. While the subscriber is disconnected, the ack does not wait.
- **`WebsocketAdaptor.joinRoom`** takes an optional third argument, `{ live: refName }`, for a live room.

Servers of this release and of earlier ones do not hear each other. During a rolling deploy, an event published on one side does not reach clients on the other until they reconnect to a new server. A Redis ACL that names the old channel must allow `<prefix>ws:*` instead.
