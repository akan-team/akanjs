---
"akanjs": patch
---

A signal test's fetch opens its socket at the first subscribe or message, so a pubsub test needs no clone.

`getOrSetupSignalTestFetch()` handed back a fetch whose socket was never opened: `fetch.subscribe<Event>(…)` on it heard nothing and warned `WebSocket is not connected. Call fetch.instance.connect()…`, and the way through was `fetch.clone({ connect: true })`. The test fetch now connects on first use, as a page's does, and the socket is closed when the test context ends. A test that never subscribes or sends a message opens no socket, as before.
