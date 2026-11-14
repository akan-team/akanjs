---
"akanjs": minor
---

A websocket now holds at most 256 pubsub rooms at once, live or not. A subscribe past that is refused with a 429 error frame coded `liveRoomLimit` (`base.error.liveRoomLimit`, `data: { limit, per: "socket" }`).
- The rooms the socket already holds keep receiving their events.
- Subscribing a room the socket already holds does not count twice.
- Leaving a room frees its place, and closing the socket frees all of them.

A page holds one room per live slice and per feed it shows, so 256 is far above what a page uses.

A caller now holds at most 2,000 rooms on a server process across all its sockets. A caller is its account when signed in, else its address. A subscribe past that is refused with the same frame, carrying `per: "caller"`, and its rooms free their places as its sockets leave them or close. Twenty tabs of twenty rooms each come to 400, so the rest leaves room for visitors who share one address. A caller whose address is unknown is bounded by the per-socket cap only. The number of sockets per address stays unlimited, because this count bounds the rooms whatever the number of sockets.

A server process now holds at most 50,000 live rooms per model that every write evaluates, across every socket. These are the rooms no equality index files and the invalidating ones; a write reaches an indexed room only through its key, so indexed rooms never count. A new room of that kind past the ceiling is refused with the same frame, carrying `per: "model"`. Rooms already held keep working, and the server warns at most once a minute per model while it refuses.

Subscribe frames now have a budget, over every pubsub endpoint: 1,000 a minute per websocket, and 10,000 a minute per caller across its sockets. A caller is its account when signed in, else its address. A subscribe past either budget is refused with the usual 429 `base.error.tooManyRequests` and `data: { seconds }`. A page's subscribes and a reconnect that resubscribes every room the socket held fit well inside both.

When the server refuses a subscribe with 429, the error frame names the room it refused (`requestRoomId`) and carries back the `token` the client numbered that subscribe frame with. A refusal whose token is not the room's latest subscribe answers an earlier one, and the client ignores it.
- Refused for a room limit (`liveRoomLimit`), the room is dropped, so a reconnect does not send it again, and the subscriber's new `onRefused(error)` fetch policy is called.
- Refused for a budget (`tooManyRequests`), the subscribe is sent again after the `seconds` the server named (counted as 1 to 60), plus up to a second of random wait per attempt. After five such tries without an ack, the room is dropped the same way.
- A refusal with any other status leaves the room as it was.

When its room is dropped, a live slice shows the error as a message, marks its list stale so the next mount refetches, and subscribes again only on its next watch, never in a loop.

**Upgrading.** Nothing changes for an app whose sockets hold 256 rooms or fewer, whose callers hold 2,000 rooms or fewer per server, whose models hold 50,000 scanned or invalidating live rooms or fewer per server, and whose sockets subscribe less often than the budgets above.
- To raise or lift the room limits, call `option.setLiveRoomLimit({ roomsPerSocket: <count>, roomsPerCaller: <count>, roomsPerModel: <count> })` in `lib/option.ts`. Pass `false` for any of them to turn it off. Libs merge in mount order, with the app last. `AKAN_LIVE_ROOMS_PER_SOCKET`, `AKAN_LIVE_ROOMS_PER_CALLER` and `AKAN_LIVE_ROOMS_PER_MODEL`, set to a count or `off`, override the code for one deployment.
- To change the subscribe budgets, call `option.setRateLimit({ subscribe: { perSocket: { calls, windowMs }, perCaller: { calls, windowMs } } })`. Set either to `false` to lift it, or `subscribe: false` to lift both. Like every other budget, they are off in a `local` environment and under `AKAN_RATE_LIMIT=off`.
