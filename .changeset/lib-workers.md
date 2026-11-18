---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

A lib's `akan.config.ts` takes `workers`, so a lib that spawns a worker declares it once.

Until now only an app's config took `workers`, and a lib whose adapter called `AppWorker.spawn("vision")` made every app that mounts it repeat `workers: { vision: "../../libs/<lib>/…" }`; an app without the line failed at run time with `workerNotDeclared`.

- **A lib declares its own workers.** `workers: { vision: "srvkit/vision.worker.ts" }` in `libs/<lib>/akan.config.ts`, the path relative to that config. Every app that depends on the lib builds `workers/vision.js` and resolves the name in `akan start` and `akan test`, with nothing in the app's config.
- **An app's own entry of the same name wins**, as with `bin`. Two libs an app depends on that name different files for one worker stop the start, the test run or the build, naming both configs, until the app's config picks one.
- **`akan test <lib>` knows the lib's workers** and those of the libs it depends on. A lib's own test run had no worker sources before.
- **A build carries only the workers of the libs the app depends on**, not those of every lib in the workspace.

Upgrade: an app that repeats a lib's worker can drop the line once the lib declares it; leaving it changes nothing. `LibConfigResult` gains a required `workers` field, which matters only to code that builds that object by hand. In `@akanjs/devkit`, `AkanWorkers.declare` is replaced by `AkanWorkers.select` and `AkanWorkers.publish`. The runtime guide's reference grows to five parts (`runtimeRule-5.md` is new, the budgets of `runtimeRule-4.md` and the `akan-runtime` `SKILL.md` are raised) because the new paragraph moved a part past the 28,000-character split.
