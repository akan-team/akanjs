---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

An app's pipeline can ship its native web bundle over the air: `{ use: "ota", targets?, platforms? }` runs after `deploy` in its own `ota` phase, followed by an `after-ota` slot. It is opt-in, so an app without it runs build → docker → deploy as before. By default it packs every native target that declares `native.updates` for both iOS and Android, and a named target without `updates` is a plan error. The plan's step carries `with: { app, targets, platforms }`, and `akanjs/common` exports `pipelineOtaPlatforms` and the `PipelinePlanOtaStep` type. An executor parsing plans with an older `akanjs/common` refuses a plan that holds `ota`.
