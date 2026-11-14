---
"akanjs": minor
---

**A `pubsub` room's `onResync` now also runs after the server's link to Redis returns.** While the Redis WebSocket adaptor's subscriber is down, events other servers publish never reach the server, and its clients' sockets stay open with no hole in their numbering, so a plain `pubsub` room silently missed them; only live rooms were invalidated. On recovery the server now sends each such room a `resync` frame (`WebsocketResyncData`, a new member of `WebsocketResData`), numbered among the room's frames so that a socket that loses it under backpressure sees a hole instead, and the client calls the room's `onResync`. Live rooms are invalidated as before.

Both now wait until Redis has answered the resubscribes, so a room that refetches cannot miss an event published in between. On a link that has not answered after 3 s, the rooms are told then and again once it answers; a link that drops again first has them told at its next return. A client of an earlier release logs the `resync` frame as an unknown message type and ignores it.

Upgrading: `WebsocketAdaptor.onRecovered` now hands its handler the rooms held on the server, `(rooms: string[]) => void`. A custom adaptor that implements `onRecovered` must call the handler with every room a socket on the server is still in, live rooms included, and only once events published to those rooms reach the server again, since each room refetches on it. Code that only reads `WebsocketResData` needs no change beyond handling, or ignoring, `type: "resync"`.
