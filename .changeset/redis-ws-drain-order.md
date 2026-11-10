---
"akanjs": patch
---

On the Redis WebSocket adaptor, events buffered while the publisher was disconnected now go out in the order they were sent. Before, an event published while the buffer drained after a reconnect went straight out, ahead of older buffered ones, and the drain started on `connect`, ahead of the commands ioredis resends on `ready`. So another server's subscribers could see a room's events out of order. A message now waits behind a non-empty buffer, and the buffer drains once the publisher is `ready`. A publish that fails goes back into the buffer in the order it was sent, where it used to go to the back. When Redis refuses a publish with an error reply, the buffer is retried on a timer, starting at 200 ms and backing off to 5 s, instead of not until the next reconnect. Shutting down waits for a drain that is still running, unless the publisher drops meanwhile.
