---
"akanjs": patch
"@akanjs/devkit": patch
---

perf(dev): a CSR dev save is patched by the resident builder, without spawning a build worker

- The dev builder keeps the CSR registry's graph, manifest and module factories in memory and compiles a save itself.
  A save no longer pays for a build worker's spawn and imports (about 130ms on minimal) or a pass over every module
  file, and `app.js` is rebuilt from memory after the patch is announced.
- A save that needs a whole-app build still goes to a build worker, which exits and returns its memory: a first build,
  a config or signal/dictionary change, a new npm module, and an import no recorded resolution answers.
- The builder works in two lanes. A save's codegen and CSR patch run in one, and the file watcher waits only for it;
  build workers, route builds and client-entry discovery run in the other, where a batch queued behind another folds
  into it. Consecutive saves no longer wait behind each other's pages and css builds, and css now builds before pages.
- `AKAN_DEV_CSR_PATCHER=off` sends every CSR save to a build worker as before. A builder that dies mid-patch turns the
  patcher off until the dev server next replaces its builder and backend together (a config, signal or dictionary
  change), and says so.
