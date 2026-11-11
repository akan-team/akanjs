---
"@akanjs/cli": patch
---

The CLI drops `AKAN_CLI_FORCE_BUILD` from its own environment, so a command it runs does not rebuild the dev CLI it runs from. In the akanjs repository, `bun run akan` now rebuilds its bundle after an edit to `@akanjs/language`, which it compiles in through devkit, and `AKAN_CLI_FORCE_BUILD=1` rebuilds even when the bundle is up to date, yielding only to a build that finished while it waited for the lock. Any number of waiters that find a dead build lock now take it over one at a time, and its 120-second lease is counted from when the current holder took it rather than from when the wait began, so a build queued behind others no longer takes over one that has just started. A forced build tells a build that finished while it waited by a nonce in the stamp file rather than by the file's time, which the kernel can record a little early.
