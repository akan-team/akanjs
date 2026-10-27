---
"akanjs": patch
"@akanjs/cli": patch
---

`akan test <target> [files]` now runs only the test files or folders you name, comma-separated, such as `akan test myapp lib/user/user.signal.test.ts`. A path is read from the target or from the workspace root, and a path outside the target is refused before anything is prepared. This is the way to run one signal test, which cannot find its app under a plain `bun test --isolate`.

Outside production, a server or a test started from inside `apps/<app>` or `libs/<lib>` without `AKAN_RUNTIME_DIR` now keeps its sockets and logs in the workspace root's `local/<apps|libs>/<name>/runtime`, where `akan test` puts them, instead of creating a `local/` folder inside the app or the library. A process started from the workspace root, from a package or outside a workspace keeps today's directory, and production still uses `./runtime`.
