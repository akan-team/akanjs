---
"akanjs": patch
---

Under `akan start`, a backend replica that crashes while it waits on the builder no longer has that answer handed to the replica respawned in its place, where it could settle the new process's own request of the same id with its predecessor's route, CSR or graph result. The gateway now forgets a replica's open builder requests when it exits, and passes each answer only to the process that asked.
