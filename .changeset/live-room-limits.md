---
"akanjs": minor
---

A websocket now holds at most 256 live rooms at once. A subscribe past that is refused with a 429 error frame coded `liveRoomLimit` (`base.error.liveRoomLimit`, `data: { limit, per: "socket" }`).
- The rooms the socket already holds keep receiving their events.
- Subscribing a room the socket already holds does not count twice.
- Leaving a room frees its place, and closing the socket frees all of them.

A page holds one live room per live slice it shows, so 256 is far above what a page uses.

**Upgrading.** Nothing changes for an app whose sockets hold 256 live rooms or fewer. To raise or lift the cap, call `option.setLiveRoomLimit({ roomsPerSocket: <count> })` in `lib/option.ts`, or `{ roomsPerSocket: false }` to turn it off. Libs merge in mount order, with the app last. `AKAN_LIVE_ROOMS_PER_SOCKET=<count>` or `off` overrides the code for one deployment.
