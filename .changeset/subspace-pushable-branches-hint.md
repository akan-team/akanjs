---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`akan subspace push` and `akan subspace plan` name the setting behind a refused branch: `` Branch "x" is not pushable. `subspace.pushableBranches` in the workspace root akan.config.ts allows: main, develop, debug ``. The message used to say only where the subspace settings live.
