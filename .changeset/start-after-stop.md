---
"akanjs": patch
---

A gateway stopped while `AkanApp.start()` was still preparing its runtime folder, logs or ops route no longer spawns replicas or listens afterwards, and its `start()` now returns instead of waiting for a stop that has already happened. A server without a gateway stopped while `AkanServer.start({ listen: false })` was opening its log control socket no longer runs its init schedules afterwards.
