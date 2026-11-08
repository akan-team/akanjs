---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

A production build now runs without Docker: `cd dist/apps/<app> && bun main.js` serves the app with no env set. Until now the env the built server needs (the app and repo names, the serve domain, locales, route prefixes, database modes and the rest) existed only as `ENV` lines in the generated Dockerfile. On a host without the image, such as a PaaS or a test harness, the server stopped at boot with `getEnv() cannot run at build time` unless a start script copied every value by hand.

**Upgrade note.** Run `akan agent install` and commit what it writes: the `akan-runtime` skill, the `config` path rule and `runtimeRule` now say how to run a build without Docker.

- **`akan build` writes `akan.env.json` beside `main.js`**, with the same values as the Dockerfile's `ENV` lines. None of them is a secret.
- **`main.js` reads it before any other module loads** and fills in only the variables the process was not started with. A variable set in the environment wins, even an empty one, so `PORT=3000 bun main.js` and a host's own settings still apply, and an image built from the generated Dockerfile runs exactly as before. The file is found beside `main.js` from any working directory, but start the server from its own folder, because the runtime reads its artifacts and writes `runtime/` and SQLite files relative to the working directory.
- **An app that writes its own Dockerfile** (`docker` as a string) and copies the build into its image now gets these values too, for whatever its Dockerfile leaves unset: among them `NODE_ENV=production`, `AKAN_PUBLIC_OPERATION_MODE=cloud` and `AKAN_LOG_TO_FILE=0`, so set those in the Dockerfile if the image needs other values.
- **A desktop app's carried server leaves `akan.env.json` behind.** Its launcher hands it its env as before, and the file would otherwise set the `PORT` and `AKAN_LOG_TO_FILE` the launcher leaves out on purpose.
