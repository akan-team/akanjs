---
"@akanjs/cli": patch
---

docs: the runtime guideline and the agent guide cover what a desktop app's server carries

`akan guideline show runtimeRule` has a section on `build-desktop --server`: `bin` and `trustedDependencies`, why
nothing from `docker` reaches the carried server, why ffmpeg should be a static LGPL build, when a server bound to
its machine stays a service with the app built without `--server`, and why devices belong to the shell's plugins.
