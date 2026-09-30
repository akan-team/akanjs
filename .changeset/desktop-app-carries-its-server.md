---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

A desktop app can carry the app's own server: for a mobile target with `native: { desktop: { server: true } }`,
`akan build-desktop`, `akan start-desktop --release` and `akan publish-update` put the backend `akan build` made into
the app, so it works on one computer with no backend elsewhere.

- The build stages `main.js`, `server.js`, the chunks, `akan.build.json` and `private/` into
  `apps/<app>/.akan/desktop/server` and installs its packages there (`bun install --production`), without the RSC
  worker, the console, the RSC renderer and the drivers of every database mode but `single`. The app needs `single`
  in `database.modes`; the command says so before it builds.
- The backend is built for the command's own `--env`, not the workspace's `AKAN_PUBLIC_ENV` (the root `.env` usually
  names `local`), so `server.js` holds that environment's `env.server.<env>.ts` and no other.
- What it carries is readable in plain text by anyone with the app: `private/`, that `env.server.<env>.ts` and the
  server env defaults of the libs it uses. Keep deployment secrets out of them. It has no `public/`, and its working
  folder is its data folder: read a runtime file from the app folder (`AKAN_APP_DIR`, else the folder of `Bun.main`),
  never from `process.cwd()`.
- At launch the shell starts it as a child on its own Bun (`BUN_BE_BUN`, with `.env`, `bunfig.toml` and
  auto-install off) on a loopback port, and hands the page its URL as `PUBLIC_AKAN_SERVER_URL`. The port of the last
  session comes first and a fresh one is picked only when it is taken, so an address registered somewhere usually
  stays valid from one launch to the next. The window waits for it up to 8 s.
- It runs API only, `operationMode` edge, database mode `single`, SSR, CSR and MCP off, bound to 127.0.0.1 with every
  other Host refused. It keeps its SQLite data, files, logs and a per-install JWT secret in the app data folder's
  `server/`, and a debug build, which has the release app's id, in its own `server-debug/`. On Windows that folder is
  `%LOCALAPPDATA%\<app id>\server`, not the Roaming folder a profile copies on every sign-in and an organisation may
  put on a file share, where SQLite's WAL does not work. Bun's transpiler cache goes to
  `<server data>/runtime/transpiler-cache`.
- It trusts the operating system's CAs (`--use-system-ca`), as the page does, and gets the proxy and CA variables
  (`HTTP(S)_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `NODE_USE_SYSTEM_CA`) and the desktop session's
  (`DISPLAY`, `WAYLAND_DISPLAY`, the session bus, the audio server, `XDG_*`, and Windows' `ProgramFiles`, `ComSpec`,
  `PATHEXT` and the like), so a `bin` tool reaches what the page reaches and can open the screen, the audio server or a
  shell. A `PATH` in `desktop.server.env` keeps the app's own `bin` first.
- `AkanApp` takes `BUN_BE_BUN` off `process.env` at boot and gives it back only to a spawn of its own executable (the
  ops snapshot, which also gets the server's runtime flags), so a `bin` tool built with `bun build --compile` starts as
  itself rather than as the Bun CLI. A child started with `Bun.spawn` and no `env` still gets the environment the
  process started with, so pass `env: process.env`.
- A crash restarts it on the same port (1 s doubling to 30 s; the fifth in a row gives up with an alert). A server that
  exits before its first ready starts again on a fresh port 250 ms later, so one that cannot boot gives up while the
  window still waits for it and the window opens at once with the alert. A server
  that cannot start at all (an unreadable `jwt.secret`, a data folder that cannot be made) still hands the page a
  loopback URL and shows the same alert once the window is up, so the page never falls back to the backend its bundle
  was built for. A restart that throws counts as one failure.
- Quitting the app stops it within its 1 s shutdown budget, inside the launcher's 1.5 s grace. On macOS and Linux it
  leads its own process group, so whatever it started and left running ends with it, and a server still there after
  the grace is killed. When the app itself was killed or crashed, the server ends its group on its own once it stops.
- It runs in one process: a `main.ts` asking for replicas (`replica`, `solo: false`) does not boot in the app.
- `XAUTHORITY`, `PULSE_COOKIE`, `PULSE_RUNTIME_PATH` and `XDG_DATA_DIRS` reach it too. On Windows a key of
  `desktop.server.env` replaces the system variable of the same name in any case, and the launcher's own keys are
  refused in any case. A second launch that hands over to the first starts none. The single-instance plugin comes with
  it.
- `akan start-desktop` without `--release`, for such a target, follows a dev server already answering on the app's dev
  port, or starts `akan start` in the same command and opens the app once it serves; it asks for one target before it
  starts one. Ctrl+C or closing the app stops the app, then the dev server it started, then the local database, one
  after another, and exits 130.
- `akan start-desktop --release` of such a target shows the carried server's lines at the level its logger wrote them.
- `AkanAppConfig.getProductionEnv()` is the env the image runs with; the Dockerfile's `ENV` lines come from it (same
  keys and order, without the two blank lines the template used to leave).
