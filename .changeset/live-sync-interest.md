---
"akanjs": patch
---

Behind the gateway, a change to a live-synced model now reaches only the replicas that hold a live room for that model. Each replica tells the gateway which models it holds rooms for when that set changes, and again in its periodic room snapshot. The gateway forwards a `live.change` only to those replicas, where it used to send every change to every replica but batch ones, and drops a replica's models when it exits. Apps on the Redis adaptor are unchanged.
