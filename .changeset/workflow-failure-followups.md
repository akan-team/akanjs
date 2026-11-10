---
"@akanjs/cli": patch
---

`akan workflow validate` exits 0 when the only failures left are known baseline blockers (`overallStatus` `passed-with-baseline-blockers`); any other failed validation still exits 1.
