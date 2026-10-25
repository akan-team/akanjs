---
"akanjs": patch
---

A websocket room is now left once when an `unsubscribe`, the socket's close and the guard re-check that follows a credential change overlap. Each of them left the room only after awaiting a guard or a cleanup, so the one that finished second left it again: a live room another socket still shared was dropped from the live sync hub, and that socket stopped receiving its changes until it subscribed again; a cleanup registered with `ws.on("unsubscribe", …)` that was still running when its socket closed ran a second time; and a room subscribed again while that cleanup ran lost its pub/sub adaptor membership and its own cleanup. Whichever comes first now takes the room before anything is awaited, and the others find nothing left to leave.

An `unsubscribe` now leaves a live room whose slice takes `.with(Ws)`, or `.with(CallerAccount)` once a credential change has refreshed the token. It derived the room id again from those arguments, which no longer read as they did at the subscribe, so it left nothing: the socket stayed in the room and kept receiving its frames, and its `ws.on("unsubscribe", …)` cleanup waited for the socket to close. It now leaves the room its subscribe joined, and its acknowledgement names that room.

A websocket `subscribe` now runs its account guards before it parses its arguments, as every other call does, so an unauthenticated subscribe with a malformed room argument is refused by its guards (401/403) instead of with an argument error. The `.live({ pauseOn })` refusal waits for the guards too: a caller they refuse gets 401/403, and one they admit is refused before the slice runs.
