---
"akanjs": patch
---

On the Redis WebSocket adaptor, each room's events and each live-synced model's changes now go out on channels of their own, and a server subscribes only to those of the rooms and models it holds. Both used to go to every server of the app on one channel, `<prefix>ws:broadcast`, which servers keep using for one more release so that a rolling deploy loses nothing (see the note on rolling deploys).

- **A room's events** go out on one of 16,384 channels, picked by a hash of the room id (`<prefix>ws:room:<shard>`). A server subscribes to a shard while it holds a room on it.
- **A change to a live-synced model** goes out on `<prefix>ws:change:<model>`. A server subscribes to it while it holds a live room for that model.
- **A subscribe is acknowledged once Redis has confirmed the SUBSCRIBE** for its channel, so an event another server publishes after the ack still arrives. While the subscriber is disconnected, the ack does not wait.
- **`WebsocketAdaptor.joinRoom`** takes an optional third argument, `{ live: refName }`, for a live room.
