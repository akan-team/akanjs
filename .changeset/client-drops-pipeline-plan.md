---
"akanjs": patch
---

A page that imports anything from `akanjs/common` no longer ships the pipeline plan parser to the browser, so every page loads about 4.8 KB less JS, brotli.

- **Before:** `PipelinePlanSchema` builds two key lists with `Object.keys` in static fields, and `pipelinePlan.ts` builds `pipelineActionNames` the same way. The bundler counted those calls as side effects, so it kept `PipelinePlanSchema`, `PipelinePattern`, `PipelineNames`, `PipelineValueReader` and the plan vocabulary in every client bundle, though only the CLI reads them.
- **Now:** those three calls are marked `@__PURE__`, so a client bundle drops the pipeline code it never uses. The parser, `pipelineActionNames` and every other export behave as before.
