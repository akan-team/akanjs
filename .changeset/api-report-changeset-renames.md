---
"@akanjs/devkit": patch
---

`ApiReportPolicy.check` counts a changeset that a branch adds in place of a similar one it deletes. git's rename detection paired the two, so the added changeset was not listed and its `minor` bump did not satisfy the check.
