---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`akan workflow validate` exits 0 when the only failures left are known baseline blockers (`overallStatus` `passed-with-baseline-blockers`); any other failed validation still exits 1. Over MCP, a passing `apply_workflow` dry run names `apply_workflow` with the same `planPath` and no `dryRun` as `next`, where it named `run_validation`, which had nothing to validate.
