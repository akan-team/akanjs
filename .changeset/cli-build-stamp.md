---
"@akanjs/cli": patch
---

The CLI drops `AKAN_CLI_FORCE_BUILD` from its own environment, so a command it runs does not rebuild the dev CLI it runs from. In the akanjs repository, `bun run akan` now rebuilds its bundle after an edit to `@akanjs/language`, which it compiles in through devkit, and `AKAN_CLI_FORCE_BUILD=1` rebuilds even when the bundle is up to date, yielding only to a build that finished while it waited for the lock.
