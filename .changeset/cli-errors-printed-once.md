---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

A failed `akan typecheck` or `akan build` prints its diagnostics once. The command wrote them to stderr and the CLI's error handler wrote them again to stdout. The handler now prints the full form itself, nested build errors and `Caused by:` chains included, for every command.
