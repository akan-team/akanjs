---
"akanjs": minor
---

A websocket now holds at most 256 live rooms at once. A subscribe past that is refused with a 429 error frame coded `liveRoomLimit` (`base.error.liveRoomLimit`, `data: { limit, per: "socket" }`).
- The rooms the socket already holds keep receiving their events.
- Subscribing a room the socket already holds does not count twice.
- Leaving a room frees its place, and closing the socket frees all of them.

A page holds one live room per live slice it shows, so 256 is far above what a page uses.

Subscribe frames now have a budget, over every pubsub endpoint: 1,000 a minute per websocket, and 10,000 a minute per caller across its sockets. A caller is its account when signed in, else its address. A subscribe past either budget is refused with the usual 429 `base.error.tooManyRequests` and `data: { seconds }`. A page's subscribes and a reconnect that resubscribes every room the socket held fit well inside both.

**Upgrading.** Nothing changes for an app whose sockets hold 256 live rooms or fewer and subscribe less often than the budgets above.
- To raise or lift the room cap, call `option.setLiveRoomLimit({ roomsPerSocket: <count> })` in `lib/option.ts`, or pass `{ roomsPerSocket: false }` to turn it off. Libs merge in mount order, with the app last. `AKAN_LIVE_ROOMS_PER_SOCKET=<count>` or `off` overrides the code for one deployment.
- To change the subscribe budgets, call `option.setRateLimit({ subscribe: { perConnection: { calls, windowMs }, perCaller: { calls, windowMs } } })`. Set either to `false` to lift it, or `subscribe: false` to lift both. Like every other budget, they are off in a `local` environment and under `AKAN_RATE_LIMIT=off`.
