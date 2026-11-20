---
"@akanjs/cli": patch
---

The core agent guide's code-style line names where `#private` does not apply: a `*.constant.ts`, `*.document.ts`, `*.service.ts` or `*.store.ts` uses TypeScript `private`. The exception was only in the `ts` rule, which loads once such a file is touched. Run `akan agent install` in a workspace to pick up the new files.
