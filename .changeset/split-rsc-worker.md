---
"akanjs": patch
---

Internal: the RSC render worker (`server/rscWorker.tsx`) is composed from one collaborator per concern instead of one 72-member class: `rscRenderHandler.ts` (a render request end to end), `rscRenderFallbacks.ts` (redirect, not-found and error answers), `rscFlightRenderer.ts` and `rscFlightStream.ts` (the Flight stream and its cancellation), `rscRouteDocument.tsx` and `rscDocumentHead.tsx` (the documents and their head), `rscResultCaches.ts`, `rscRenderStats.ts` and `rscRenderControl.ts`. Rendering, streaming order, error digests, caching and the worker's messages behave as before, and `akanjs/server/rsc-worker` exports the same names.
