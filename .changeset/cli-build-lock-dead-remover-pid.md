---
"@akanjs/cli": patch
---

When `akan` cannot measure the filesystem's clock beside its build lock, it now still steps past a removal marker left by a process that has exited, instead of waiting on it for good. Each removal marker records the pid of the process holding it.
