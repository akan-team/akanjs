---
"@akanjs/devkit": patch
---

Internal: the dev builder process (`IncrementalBuilder`) runs its work lanes, the CSR and SSR dev registries, the file watcher and boot recovery through one collaborator each, in `builderLanes.ts`, `csrRegistry.ts`, `ssrRegistry.ts`, `builderWatch.ts`, `builderBoot.ts` and `builderBuildStatus.ts`, instead of one 90-member class. Behaviour is unchanged: the same messages are sent in the same order, and route builds, recycling at the memory ceiling and degraded-boot recovery work as before.
