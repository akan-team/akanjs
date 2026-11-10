---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

A command whose app-or-lib target is left out no longer stops at a prompt error when stdin is not a terminal, as in a coding agent's shell or CI. In a workspace with a single app, lib or package, `akan sync`, `akan lint`, `akan test` and `akan create-module <name>` run on it and say so on stderr, so a new workspace's `bun run sync`, `bun run lint` and `bun run test` work there. Otherwise every target command (app, lib, package, module) exits at once with the valid targets and the line to rerun, such as `akan sync <app-or-lib>`. A library, package or module is still never picked unasked, since `akan remove-library` and its kin would delete the only one. A terminal is asked as before.
