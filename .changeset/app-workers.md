---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

An app declares code that runs in a process of its own, and the framework builds, finds and supervises it.

`workers` in an app's `akan.config.ts` maps a name to an entry file (`workers: { vision: "srvkit/vision.worker.ts" }`). `akan build` bundles each as its own entry to `workers/<name>.js`, with the server's externals and env handling and never as a chunk of `server.js`, so a native addon the worker imports is not loaded by the server. The image and a desktop app's server carry the folder; `akan start` and `akan test` run the worker from its declared source.

`AppWorker.spawn(name, options)` from `akanjs/server` starts it with the Bun that runs the server: stdout and stderr are relayed line by line to the server's logger, a worker that exits with an error or on a signal is started again with a doubling delay (1s to 30s; `restart: false` leaves it down, an exit with code 0 stays down), `onMessage` opens an IPC channel that `worker.send` writes to, `stop()` sends SIGTERM and then SIGKILL, and every running worker gets SIGTERM when the server process exits. The worker gets the variables a process needs to start plus `options.env`, not the server's env, unless `inheritEnv` is set. `AppWorker.pathOf(name)` returns the file for code that spawns by hand. An undeclared name throws `AppWorkerError` with the code `workerNotDeclared`, and `send` without a channel `workerNotConnected`.

The runtime guideline documents the section, and its reference files are larger: `runtimeRule-2.md` by 3430 bytes and `akanApi-app-config.md` by 138.

No upgrade step for an app. `AppConfigResult` gains a required `workers`, so code that builds one by hand adds `workers: {}`; `akanjs/server/appWorkerPath` is a new entry point the build tooling reads.
