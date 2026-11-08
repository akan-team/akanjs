---
"@akanjs/cli": patch
---

A new workspace no longer gets a `patches/` folder. The two zod patches it held were listed in no `patchedDependencies` entry, so Bun never applied them, and their 3.25.76 and 4.4.3 versions match no zod the framework installs. An existing workspace can delete `patches/zod@3.25.76.patch` and `patches/zod@4.4.3.patch` when no `patchedDependencies` entry names them.
