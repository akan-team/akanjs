---
"akanjs": patch
---

A service declared with `serve(..., { serverMode: "batch" })` now checks `SERVER_MODE` when the server reads whether it is enabled, at boot, instead of when its module is imported. A script or test that imported the app before setting `SERVER_MODE` used to boot with that service off. Each read answers for the `SERVER_MODE` in effect then, so two servers booted one after another in the same process under different modes each get their own answer. An explicit `enabled` still wins over `serverMode`, and an `enabled` thunk still runs once, at its first read.
