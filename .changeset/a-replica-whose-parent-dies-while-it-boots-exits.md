---
"akanjs": patch
---

fix: a server whose parent dies while it boots exits instead of serving on

A replica (and a desktop app's carried server) listened for its parent's IPC channel closing only after its `init`
finished, and Bun drops that event for a listener added after a `message` listener, which the single-mode queue and
pub/sub add during `init`: a gateway or shell killed during boot left the server running, holding its port and its
database, with its cron jobs. It now listens before `init`, treats a channel already closed or a `ready` it could not
send as a parent gone, and ends its process group the same way it does after boot.
