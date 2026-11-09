---
"akanjs": patch
---

A write to a live-synced model now evaluates only the rooms it can match. Each room is filed in a per-model index under one of its `eq` or `oneOf` conditions. A write looks up its own values there and evaluates the rooms it finds, plus the rooms that have no such condition. Room membership does not change. With 50,000 rooms whose queries mix `oneOf` and `q.all`, routing a write took 38 ms and now takes about 20 µs.

The live room replay log no longer slows down past 10,000 subscribed rooms. Its room cap now evicts only rooms nobody on the server subscribes to, so a publish no longer walks every subscribed room: at 12,000 rooms it took 414 µs and now takes 0.5 µs. Kept frames now share a 64 MiB budget: past it, the room that published least recently loses its oldest frames first. Frames older than the retention window are dropped even in a room that stopped publishing. A full log used 866 MiB and now stays near 61 MiB. A client whose missed frames were dropped resynchronizes, as it already does after any gap.
