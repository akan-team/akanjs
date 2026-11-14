---
"akanjs": minor
---

**A gateway's `/_akan/app/ready` now answers 503 while no replica's RSC worker can render a page**, so a pod whose worker is booting or restarting leaves the Service after two failed probes (about 10–20 s with the chart's 10 s period and failure threshold of 2) instead of taking page requests it cannot render. Each replica now reports its RSC worker's state in every health pong (every 2 s) and in its `ready` message, and the gateway sends HTTP requests to a replica whose worker is ready while any is, falling back to the others when none is; websocket upgrades keep plain round-robin over every replica. A gateway with several replicas stays ready while at least one of them can render. The ready route's `children` entries now carry `rscWorker`.

No upgrade step is needed: `AkanIpcMessage` only gains an optional `rscWorker` on `ready` and `health.pong` (typed `AkanRscWorkerStatus`), and a replica of an earlier release that sends neither counts as ready, as before.
