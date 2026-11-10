---
"@akanjs/devkit": patch
---

`executors.ts` is split into one file per class under `executors/` and re-exports the same names, so every import of `@akanjs/devkit/executors` and the root barrel is unchanged. Each file under `executors/` also loads on its own: `akanConfig` and `scanInfo` import the `SysExecutor` subclasses when they use them, so no import order loads a subclass before its base.
