---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

A failed `akan typecheck` or `akan build` prints its diagnostics once, on stderr. The CLI's error handler printed them a second time on stdout, so anything reading both streams got every diagnostic twice.
