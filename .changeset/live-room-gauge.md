---
"akanjs": minor
---

An operator can graph and alert on the number of live rooms: `/_akan/app/metrics` now carries the `akan_live_rooms` gauge next to `akan_room_replay_bytes` and `akan_pubsub_buffered_messages`, and the metrics report carries it as `roomCount`.

It counts the live-query rooms one process holds, one per room id however many sockets share it. Behind a gateway each replica reports its own and the scrape adds them up per `role`, so a room that sockets on two replicas share counts once on each; the gateway's `rooms` field in the status still gives the distinct count.
