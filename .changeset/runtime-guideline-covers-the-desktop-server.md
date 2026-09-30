---
"@akanjs/cli": patch
---

docs: the runtime guideline and the agent guide cover what a desktop app's server carries

`akan guideline show runtimeRule` has a section on a desktop app's carried server (`native.desktop.server`): `bin` and
`trustedDependencies`, why nothing from `docker` reaches the carried server, why ffmpeg should be a static LGPL build,
when a server bound to its machine stays a service with the app's target carrying none, and why devices belong to the
shell's plugins.
