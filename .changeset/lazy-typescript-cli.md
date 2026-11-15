---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`akan --version` loads no command module, and `akan tunnel`, `akan subspace` and the package commands such as `akan version` no longer load the TypeScript compiler unless a step compiles.
