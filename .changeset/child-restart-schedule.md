---
"akanjs": patch
"@akanjs/devkit": patch
---

The five child-process restart loops now share one restart schedule, `RestartSchedule` from `akanjs/common`: the gateway's replicas, the RSC worker, the incremental builder, and `akan start`'s backend and builder recovery. It counts failed restarts, waits before the next one and cancels a pending one on stop. Each loop keeps its own delays (200ms–30s for the RSC worker, 2s–60s for `akan start`'s builder recovery, 1s–30s for the rest), its own give-up rule and its own log lines.

Two stop races in those loops are fixed:
- A replica whose restart timer had fired no longer respawns after the gateway stops.
- A builder `akan start` was still creating or booting when it stopped is now stopped too, instead of being started or retried after its ready timeout.

In `@akanjs/devkit`, `shouldAbandonBackendRecovery` is replaced by `backendRecoveryPolicy`, which gives up after five failed backend restarts as before.
