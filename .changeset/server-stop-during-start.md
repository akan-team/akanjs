---
"akanjs": patch
---

An `AkanServer` stopped while `init()` was still initializing, or while `listen()` was still opening its log transport, no longer goes on to listen and serve: the start tears down what it has brought up and returns, and `stop()` resolves once the server is stopped, which during `init()` means after the container or web router under way finishes starting, beyond `shutdownTimeoutMs`. A replica whose gateway is gone by the time it reports ready no longer runs its init schedules while it shuts down.
