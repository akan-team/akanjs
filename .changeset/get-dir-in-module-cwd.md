---
"@akanjs/devkit": patch
---

Listing an app's or lib's modules (`SysExecutor.getModules`, and the constant-file readers built on it) no longer fails with `ENOENT` when the process runs outside the workspace root, and skips a dangling symlink instead of rejecting.
