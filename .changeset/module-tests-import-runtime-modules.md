---
"@akanjs/devkit": minor
---

A module's `*.signal.test.ts` / `*.service.test.ts` may import the runtime's `node:*` and `bun:*` modules (`no-import-external-library-in-test.grit`); third-party packages stay refused there.
