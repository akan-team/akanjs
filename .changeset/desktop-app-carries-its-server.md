---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

A desktop app can carry the app's own server: `akan build-desktop --server` and `akan start-desktop --release
--server` put the backend `akan build` made into the app, so it works on one computer with no backend elsewhere.

- The build stages `main.js`, `server.js`, the chunks, `akan.build.json` and `private/` into
  `apps/<app>/.akan/desktop/server` and installs its packages there (`bun install --production`), without the RSC
  worker, the console, the RSC renderer and the drivers of every database mode but `single`. The app needs `single`
  in `database.modes`; the command says so before it builds.
- At launch the shell starts it as a child on its own Bun (`BUN_BE_BUN`, with `.env`, `bunfig.toml` and
  auto-install off), on a loopback port picked for the session, and hands the page its URL as
  `PUBLIC_AKAN_SERVER_URL`. The window waits for it up to 8 s. It runs API only, `operationMode` edge, database mode
  `single`, SSR, CSR and MCP off, bound to 127.0.0.1 with every other Host refused, and keeps its SQLite data, files,
  logs and a per-install JWT secret in the app data folder's `server/`. A crash restarts it on the same port (1 s
  doubling to 30 s; the fifth in a row gives up with an alert); quitting the app stops it, and a second launch that
  hands over to the first starts none. The single-instance plugin comes with it.
- `env.server.<env>.ts` ships inside the app in plain text: keep deployment secrets out of it.
- `akan start-desktop --server` without `--release` follows a dev server already answering on the app's dev port, or
  starts `akan start` in the same command and opens the app once it serves; Ctrl+C or closing the app stops both.
- `AkanAppConfig.getProductionEnv()` is the env the image runs with; the Dockerfile's `ENV` lines come from it (same
  keys and order, without the two blank lines the template used to leave).
