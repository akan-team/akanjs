---
"akanjs": patch
---

On the Redis WebSocket adaptor, each room's events and each live-synced model's changes now go out on channels of their own, and a server subscribes only to those of the rooms and models it holds. Both used to go to every server of the app on one channel, `<prefix>ws:broadcast`, which servers no longer publish or listen on.

- **A room's events** go out on one of 16,384 channels, picked by a hash of the room id (`<prefix>ws:room:<shard>`). A server subscribes to a shard while it holds a room on it.
- **A change to a live-synced model** goes out on `<prefix>ws:change:<model>`. A server subscribes to it while it holds a live room for that model.
- **A subscribe is acknowledged once Redis has confirmed the SUBSCRIBE** for its channel, so an event another server publishes after the ack still arrives. While the subscriber is disconnected, the ack does not wait.
- **`WebsocketAdaptor.joinRoom`** takes an optional third argument, `{ live: refName }`, for a live room.
- **A rolling deploy from 3.1, or a 3.2.0 rc before rc.6, loses events between servers.** A server of that release and one of this release do not hear each other's events and changes until every server runs this release, so deploy them all at once, or accept missed events across servers for that window. A deploy from rc.6 or a later rc loses nothing.
- **A Redis ACL** that names only `<prefix>ws:broadcast` must also allow `<prefix>ws:room:*` and `<prefix>ws:change:*` before this release goes out. Keep `<prefix>ws:broadcast` allowed until no server of an earlier release runs or may be rolled back to: a 3.1 server refused it fails to start, and one of 3.2.0-rc.7 to rc.15 holds back every event behind the copy it is refused. Only then narrow `<prefix>ws:*` to the two.
