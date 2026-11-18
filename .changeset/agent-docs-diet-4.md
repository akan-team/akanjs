---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

A coding agent reads less before its first page: the generated AGENTS.md is about 9% smaller, leaving to the path rules what they already say while still naming every check that breaks the build, and it now says that `i18n: { localePrefix: "as-needed" }` in `akan.config.ts` serves URLs without `/<locale>/`. The `akan-page` skill now holds the guard basics, the first-render `searchParams` snapshot and Link prefetch, so `pageRule` keeps only the deeper contract (12 KB to 7 KB), and the `@akanjs/cli` README tells an agent to read the workspace's `AGENTS.md`, rules and skills rather than the package's `guidelines/` folder. Run `akan agent install` in a workspace to pick up the new files.
