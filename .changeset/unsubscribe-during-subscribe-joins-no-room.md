---
"akanjs": patch
---

An `unsubscribe` sent while that room's `subscribe` was still running its guards or handler no longer leaves the room joined until the socket closes. The unsubscribe found no room to leave, and the subscribe then finished and joined one, so the live sync hub, the pub/sub adaptor and the gateway's room table counted a subscriber its client had already let go. Such a subscribe now joins nothing, answers `subscribe: false`, and runs the cleanup its handler registered with `ws.on("unsubscribe", …)`, as an unsubscribe after the join would; a subscribe sent again after the unsubscribe still joins.
