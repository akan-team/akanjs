---
"akanjs": minor
---

Under `AKAN_MEMORY_LOG=1`, the RSC worker's metrics name the routes whose first render grew it most.

- `rscFirstRenderMemory` on `AkanMetricsReport`, served in `/_akan/app/metrics` beside the last render's fields, lists for each route what its first render in this worker added to `rss`, `heapUsed`, `external` and `arrayBuffers`, with the modules that render loaded. Largest RSS growth comes first, and at most 20 routes are kept. Renders running at the same time land in the same delta, so read it on a quiet replica.
- With `AKAN_MEMORY_LOG` off, a render pays one check and the field is absent. With it on, a route's first render reads process memory twice. The list lasts for the worker's life, through a pages reload.

**Upgrading.** Nothing to change. Code that copies every `AkanMetricsReport` field into a metrics backend gets one more field, an array, and only under `AKAN_MEMORY_LOG=1`.
