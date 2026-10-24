---
"@akanjs/devkit": patch
---

`akan subspace push` keeps whatever root `Jenkinsfile` and `akan.config.ts` a subspace has, a `Jenkinsfile` an earlier push left there included, and never delivers the workspace's.
