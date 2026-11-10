---
"akanjs": patch
---

A socket that is down keeps at most 100 messages emitted meanwhile, dropping the oldest, and says how many it dropped when it reconnects. Before, the outbox grew without end, so a stream of emits (a cursor, a typing signal) on a tab offline for minutes held every one of them and sent them all at once on reconnect. `configureWs({ outboxLimit })` sets the cap: `0` keeps none, and `Infinity` keeps every one. Room subscriptions never queue there and are sent again on every open, as before.
