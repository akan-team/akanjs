---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

Internal: `ApplicationCommand` in `application/application.command.ts` now declares its commands through one helper per family (`workspaceTargets`, `migrationTargets`, `inspectTargets`, `buildAndTestTargets`, `nativeBuildTargets`, `startTargets`, `releaseTargets`, `updateTargets`, `databaseTargets`) instead of one 530-line builder. Every command, alias, option, default and `--help` line is unchanged, in the same order. `@akanjs/devkit/commandDecorators` now exports `CommandBuilderContext`, the type such a helper takes.
