---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

The typecheck behind `akan typecheck`, `akan verify` and `akan build` now uses its incremental cache. It wrote a `.tsbuildinfo` on every run, then checked every file again anyway, so a run with nothing changed cost as much as the first: about 8 seconds on a 2,400-file project. Now a run re-checks only the files that changed and the files they affect, and reads the rest from the cache. The same project's second run takes about 1.2 seconds. The diagnostics are the same, in the same order, as a full check: options, global, syntax, type and declaration errors, an edited file's new errors and the errors it causes in files that import it. `--clean` still clears the cache first.
