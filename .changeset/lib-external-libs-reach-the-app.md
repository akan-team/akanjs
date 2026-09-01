---
"@akanjs/devkit": patch
---

feat(config): a lib's `externalLibs` reaches every app in the workspace

`libs/<lib>/akan.config.ts` has always accepted `externalLibs` — it typechecks, `AkanLibConfig` resolves it, and the
lib scan result carries it — but nothing ever read the value back. All three consumers (the backend and rsc-worker
bundle externals, the SSR pages bundle, and the production `package.json` dependencies) read the *app* config, so a
lib wrapping a runtime-sensitive dependency had to ask every app to repeat the declaration. Forgetting one surfaced
as a native package bundled into the app rather than as an error.

An app's `externalLibs` is now its own declaration plus every lib's, deduped with the app's entries first. A
workspace where no lib declares one resolves exactly as before.

The libs are read workspace-wide rather than narrowed to the app's own dependencies. That set comes from the
dependency scan, and the incremental page rebundle re-reads this config on every file change from a child process
that never scans — so narrowing it would put a full dependency scan in the hot path. The trade is that a lib's
declaration also lands in the production dependencies of an app that does not use that lib.

`LibExecutor.getConfig({ refresh: true })` now busts the module import cache the way the app config already did, so
a `libs/<lib>/akan.config.ts` edited while the dev server runs is re-read instead of returning the first-loaded
module.
