---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

A workspace that typechecks code reaching `@akanjs/devkit/akanConfig`, `/pipeline` or `/mobile` no longer fails with `Cannot find module '@akanjs/native/api'`: devkit now takes the native build types from the new `akanjs/native/api` and `akanjs/native/config` subpaths, which resolve to the copy akanjs embeds. Publishing verifies that no dist still imports a package that is never published.
