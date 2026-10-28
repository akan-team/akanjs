---
"akanjs": patch
---

Boot now refuses two modules that declare an internal job (`initialize`, `destroy`, `interval`, `timeout`, `cron`, `process`) under one name, and the error names both. The scheduler, its locks and the queue know a job by its method name alone, so until now the later declaration silently replaced the earlier, or the two shared one lock and ran as one job. Rename one of the pair.
