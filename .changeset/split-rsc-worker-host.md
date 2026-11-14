---
"akanjs": patch
---

Internal: the RSC worker host (`server/rscWorkerHost.ts`) is composed from one collaborator per concern instead of one 80-member class: `rscWorkerProcess.ts` (spawning, exit and restart of the worker process), `rscHostRequests.ts` (pending renders, page prompt calls, queued sends and cancel), `rscHostReloads.ts` (the bundle state a worker boots from and the reload handshake), `rscWorkerRecycler.ts` (rolling recycles and their thresholds) and `rscHostRenderStream.ts` (a worker render as the host's stream). Message order, reloads, recycles, restarts and metrics behave as before, and `rscWorkerHost.ts` exports the same names.
