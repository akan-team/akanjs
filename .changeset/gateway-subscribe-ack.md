---
"akanjs": patch
---

Behind the gateway, a WebSocket subscribe is now acknowledged once the gateway routes the room to the replica that holds it. The gateway used to learn of the room in a message the replica sent without waiting, so an event or a live-list write handled by another replica right after the ack could reach the gateway first and be dropped.

- `SolidPubSub.joinRoom` sends its `pubsub.subscribe` with an `ack` number and resolves when the gateway answers `pubsub.subscribed`. A replica's messages reach the gateway in order, so the answer also covers the live models it reported before the subscribe.
- The wait ends after 3 s if the gateway does not answer, and at once on shutdown. A server that is not a gateway child (no `AKAN_CHILD_SOCKET`) does not wait: a solo server, a desktop one included.
