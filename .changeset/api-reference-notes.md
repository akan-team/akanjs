---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

The generated API reference says two things a signature cannot: under the endpoint stages, that `.search()` is always optional and takes no `nullable` (the caller may omit it or pass `null`, the handler gets `T | undefined`), and under `adapt`, that an adaptor class has `this.logger` and that the server awaits its `onInit()` before the app serves and its `onDestroy()` when it stops. Run `akan agent install` in a workspace to pick up the new files.
