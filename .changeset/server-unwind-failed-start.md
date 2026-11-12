---
"akanjs": patch
---

An `AkanServer` whose `init()`, `listen()` or `start({ listen: false })` throws, for example on a missing route seed index or a port already in use, now tears down what it brought up before the error reaches the caller. That means the web router and its RSC worker, the log transport and its control socket, and the container, destroyed once. It ends `stopped`, so calling `start()` again starts it instead of throwing "already running", and the retried server answers each gateway message once.
