---
"akanjs": minor
"@akanjs/cli": patch
---

A signal test mounts a module its `serve()` gates, and a call to a module the server did not mount names it.

A module declared with `serve(name, { enabled: process.env.X === "y" }, …)` or `operationMode: ["edge"]` is off in a signal test, which runs `local` with no such env. A test could only turn it on by setting `process.env` before the first fetch, and a call to its endpoint failed as a bare 404 (`base.error.unexpectedResponse`).

- **`configureSignalTest({ enableModules: ["camera"] })`** mounts the named modules whatever their `enabled` or `operationMode` says, with the gated modules they depend on or relate to, and the modules that were off only because they depend on one. `"@edge"` names every module that lists that mode. A name nothing registers fails the boot, and `disableModules` still wins. `TestServer` and `AkanServer` take the same `enableModules` option.
- **`moduleNotMounted`** — under `akan start`, a development or test `NODE_ENV`, or `AKAN_ERROR_DETAIL=1`, a query or mutation of a module the server did not mount answers 404 with this code and a message naming the endpoint, the module and why it is off. A production server keeps the bare 404.

Upgrade: a test that expected `base.error.unexpectedResponse` from a call to a module the server did not mount now gets `moduleNotMounted`; nothing else changes. `AkanServerOptions`, `TestServerOptions` and `SignalTestOptions` each gain the optional `enableModules`. A test that set `process.env` ahead of `getOrSetupSignalTestFetch` to pass an `enabled` gate can call `configureSignalTest({ enableModules: [...] })` at the top of the file instead.
