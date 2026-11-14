<!-- akan:generated -->

# Runtime Rule — Serving, Processes, Dev Server, Logging, Image, Native Apps, Desktop Server, Assets, Build Pipeline

How an Akan app is built, what it serves, how many processes it runs, where its logs go, and what ends up in
its image. Everything here is declared in `akan.config.ts` or narrowed by an env at boot; none of it is reached
from domain code. `conventions` carries the invariants — this is the full contract behind them.

## Web Surfaces — Building And Serving Without SSR/CSR

An app serves three things: the API, the SSR/RSC web renderer, and the CSR single-file bundle. The API is always
on; the other two are declared in `akan.config.ts` as **`web: true | false | { csr: boolean }`** and can be
narrowed again per deployment.

```ts
const config: AppConfig = { web: { csr: false } }; // web without the CSR bundle the native apps ship
const config: AppConfig = { web: false }; // api only
```

- **`web: { csr: false }`** drops the CSR build phase and the `/__csr` + `?csr=true` routes. The CSR bundle is
  what the native apps ship, so a web-only deployment never needs it — and an app that declares a `native` section
  is refused, because every native build copies `dist/apps/<app>/csr/<target>.html` into the target's web root,
  `dist/native/<app>/<target>/web`.
- **`web: false`** is an API-only build: no base artifact, no pages or client bundles, no RSC worker
  entrypoint, and no `public/` in the image (the web router's catch-all is its only reader). Nothing under
  `page/` is served, including routes a lib contributed through `syncPageLibs`.
- **There is no CSR-without-SSR option, by type.** The CSR bundle inlines the stylesheet the SSR base artifact
  compiles, so it would ship an unstyled app — the object form therefore carries only `csr`, and SSR goes off
  only through the whole-surface `false`.
- **At runtime, `AKAN_SSR` and `AKAN_CSR` narrow further and never widen** — `false` or `0` turns one off, and
  `AKAN_SSR=false` takes CSR with it for the same reason the option has no such pair. A surface the build left
  out cannot be switched back on, and the boot log names what the process ended up serving. The generated
  Dockerfile writes the build's own answer as the image default.
- **A build with no web artifact boots the API instead of crashing.** `WebRouter.create` returns `null` when
  `.akan/artifact/base-artifact.json` is absent — an api-only build, or a workspace with no `page/` at all.
- `akan start` ignores `web` and keeps the whole dev surface: the incremental builder is also the file watcher,
  so switching it off would take server-code HMR with it. It warns once when the config and the dev server
  disagree.
- The saving is mostly the RSC worker, which is a **separate process per web-serving replica**. Measured on
  `apps/akan` at boot plus one render: 350MB across 3 processes with SSR on, 120MB across 2 with
  `AKAN_SSR=false`, and the built image goes 86MB → 6.2MB when the artifacts are left out of it too.
- **The generated image installs `ca-certificates` and `tzdata` and nothing else.** It used to carry the whole
  Chromium runtime, ffmpeg, `build-essential`, `python3` and `redis` in every app's image whether or not the app
  reached for any of them. An app that needs one declares it in `docker.preRuns` / `docker.postRuns`, which are
  emitted around the `bun install` — that is the migration for a `puppeteer` or `ffmpeg` app.

## Route Prefixes — Where The API Is Mounted

Signal endpoints hang off `/api` and the websocket upgrade off `/api/ws`. Both move, and both have to move in
three places at once: the route table the replica builds, the gateway's own upgrade check, and the `fetchClient`
in every browser tab. That last one is the constraint the design is built around.

```ts
// apps/<app>/main.ts — the deployment's answer
await new AkanApp({ prefix: "/backend", websocketPrefix: "/socket" }).start();
```

```ts
// apps/<app>/akan.config.ts — the build's answer, for the bundles a server never gets to correct
const config: AppConfig = { api: { prefix: "/backend", websocketPrefix: "/socket" } };
```

- **Three sources, narrowest first.** `globalThis.__AKAN_PREFIX__`, then `AKAN_API_PREFIX` / `AKAN_WS_PREFIX`,
  then `AKAN_PUBLIC_API_PREFIX` / `AKAN_PUBLIC_WS_PREFIX`, then `/api` and `/ws`. Read them through
  `getApiPrefix()` / `getWsPrefix()` from `akanjs/base`; never write either literal again.
- **`AKAN_API_PREFIX` is deliberately outside the `AKAN_PUBLIC_*` namespace.** Only that namespace is inlined
  into client bundles at build time, so a name inside it could never act as a runtime override — and only a name
  inside it can reach a prebuilt bundle at all. The two jobs need two names.
- **`new AkanApp({ prefix })` reaches the browser through the page, not through a prop.** `FetchClient` fixes its
  origin when the module graph initializes, before any component renders, so a React prop — a `System.Provider`
  value, anything out of `implicitRootLayout` — is always too late. The value rides the SSR classic bootstrap
  script instead, the one thing guaranteed to run ahead of every module script, and is omitted when it matches
  what the bundle already assumes. `akan.config.ts` is what a native app bundle or a statically served CSR shell
  follows, because neither is rendered by a server that could tell it otherwise.
- **A prefix is a path segment.** A blank value or a bare `/` is refused: `/` would be mounted ahead of the SSR
  catch-all and swallow every page route. A prefix whose first segment is a declared basePath is refused at
  `init()` for the same reason in the other direction.
- **The prefix is fixed before `init()`.** `setPrefix` / `setWebsocketPrefix` throw once the server has started,
  because `init()` is where the route table and the devtools routes are built.
- `robots.txt`, the locale redirect's API bypass and the OpenAPI `servers` URL all derive from it. The blob
  storage default (`/api/localFile/getBlob`) does **not**: those URLs are stored in rows, so moving the prefix
  does not move what was already written.

## The Process Model — Gateway And Solo

A container runs one process per replica, a gateway in front of them when there is more than one, and one RSC
worker per web-serving replica.

- **One traffic replica runs in the container's only process.** `AKAN_REPLICA=0,0,1` — the default, and what
  every environment in `infra/app/values` sets — means there is nothing to balance and nothing to fan pubsub out
  to, so `AkanApp` starts that replica in-process rather than spawning it. Measured on `apps/akan`: 28MB less RSS
  and twice the requests per second, because every request used to cross a unix-socket proxy hop. Declare two or
  more and the gateway is back, spawning and proxying them.
- **`AKAN_SOLO=false` forces the gateway** for a single replica. Like `AKAN_SSR`, the env only narrows — it
  cannot fold a real gateway's replicas into one process. Passing `replica` to `new AkanApp(...)` also keeps the
  gateway: code that states a topology is asking for the thing that serves it.
- **`akan start` always runs the gateway**, whatever the replica count. It is also the dev host's builder relay,
  its crash page, and what holds the port across a child restart.
- **A batch-only replica (`0,1,0`) keeps the gateway too**, because a batch server never listens and the gateway
  is then the only thing bound to answer `/_akan/app/health`.
- **The RSC worker is never folded in.** It runs under `--conditions react-server`, which resolves the same
  module graph differently, so it cannot share a process with the server that renders client components.
- **A solo process answers `/_akan/app/health`, `/_akan/app/metrics` and `/_akan/bench/ping` itself**, in the
  gateway's own shape — a `children` array with one entry — so a probe reads one contract either way. It owns the
  rotating log file the gateway would otherwise write, in the same `runtime/logs` directory.
- **Health detail and metrics answer only `Authorization: Bearer $AKAN_STATUS_TOKEN`** (or the log stream token)
  outside the local dev runtime — `AKAN_PUBLIC_ENV` and the operation mode both `local`, under `akan start` or a
  `NODE_ENV` other than `production`, so a built server stays closed: without it `/_akan/app/health` is `{ status }`
  alone (still 200) and `/_akan/app/metrics` is 401. An address that sends 10 wrong bearers in a minute is refused
  the right one too until the minute passes. A probe that reads only the status code needs nothing; give a scraper or
  monitor `AKAN_STATUS_TOKEN` (32 characters or more, or it warns), which reads nothing else.
- **Nothing supervises a solo process but the orchestrator**, since the gateway's crash-restart-with-backoff went
  with it. `infra/app/templates/app.yaml` carries the liveness, readiness and startup probes that replace it.
- **`PORT` is the whole tree's port, and a server-side self-call follows it.** `AkanApp` resolves it once
  (`new AkanApp({ port })`, else `PORT`, else 8282) and publishes it to the replica it runs in-process and to
  every child it spawns — a federation child listens on a unix socket, but the loopback fetches its SSR and RSC
  worker make still come back through the gateway. `getEnv().serverPort` reads it whenever the origin resolved to
  `localhost`, so a container run with `PORT=80` calls itself on 80. Override the origin only when it is genuinely
  not this process: `AKAN_PUBLIC_SERVER_PORT` outranks `PORT`, and a `SERVER_HOST` naming another host is not a
  self-call and keeps its explicit port.
- **`main.ts` imports `AkanApp` from `akanjs/server/akanApp`, not the barrel.** The barrel re-exports
  `AkanServer`, whose graph the gateway never runs; through it the process evaluated 35MB of SSR renderer and
  SQLite driver to spawn children and relay bytes. Keep entrypoint imports at the leaf.

## The Dev Server And Local Runs — `akan start`

- After changing application source code, test the app with `bun run akan start <appName>`; test production build
  generation with `bun run akan build <appName>`.
- **`akan start` takes several apps** — `akan start a,b`, `akan start a b`, `akan start all`, or no argument at
  all for a checkbox that remembers the last pick.
- **It opens a full-screen view by default, at any app count.** A rail of apps with the processes inside each
  one — `host` for the dev host, gateway and RSC worker, plus a row per replica the gateway forwards — and the
  selected one's log beside it. `Tab` walks every row and `1`-`9` jump to that app (the rail shows each app's
  digit), `↑↓` scroll (shift for a page, `G` back to following), `/` greps, `e` shows stderr only, `c` clears,
  `y` copies, `Y` copies the log path, `o` opens the browser, `r` restarts that app, `q` quits. Under `--share`,
  `s` copies the public URL — the selected app's, or every app's from the merged row — and the header carries it
  ahead of the local one, because the line `--share` printed before the view took the terminal is gone by its
  first repaint. **`--plain` prints prefixed interleaved lines instead**, and a pipe, a redirect or an unsized
  terminal downgrades to that on its own.
- **A supervised session writes `local/apps/<app>/runtime/dev.log`, and that path is how a log gets handed over.**
  Ink repaints one frame in place, so the full-screen view leaves a bordered screenshot in the scrollback and takes
  the rest of the session with it — a drag-selection is cleared by the next repaint, and what survives carries
  borders and lines truncated to the pane. The file is the same output with no ANSI, nothing truncated, and every
  process of the app in arrival order, including the dev host's own build output, which reaches no other file. The
  previous session is kept beside it as `dev.prev.log`. Hand somebody — or an agent — the path rather than a paste:
  it costs one line instead of a transcript, and it can be re-read after a fix. In the view, `y` copies the lines
  the filters have already narrowed and `Y` copies the path.
- **How many apps boot at once is the machine's answer, not a constant.** A cold boot is an app's RSS peak (~1.8GB
  per app, most of it the build worker — the base build, then the SSR registry's), so the default wave is what
  memory and cores allow — half the memory budget divided by that peak, and one app per four cores — which boots a
  laptop's apps together and still staggers them inside a small container. The session says which in one line.
  The next wave starts once an app serves and its boot builds have settled, or 30 seconds after it serves, while
  the app shows as ready — and `--open` opens it — as soon as it serves. `--concurrency <n>` overrides the wave
  size, and `AKAN_MEMORY_LIMIT` lowers the budget it derives from.
- **`--kill` frees the dev ports first** — it resolves each port's listener, walks up to the top of that akan dev
  tree and signals it, so another checkout's server or a stale orphan on the same port is reclaimed. A holder that
  is not recognisably an akan process is reported and left alone.
- **A dev server watches its own app directory and the libs it actually depends on**, transitively, resolved once
  at boot from the synced manifests — so a save under a lib the app never imports rebuilds and reloads nothing,
  and neither does a save in a sibling app. An import that makes a new lib a dependency needs a fresh
  `akan start`, because it needs a `sync` first anyway. Before the first `sync` the manifests do not exist yet and
  the whole `libs/` container is watched, which is the safe direction.
- **A built artifact runs from the generated app directory, without Docker and without an env.** `akan build`
  writes `akan.env.json` beside `main.js` with the values the Dockerfile's `ENV` lines set, and `main.js` takes
  each one the process was not started with, so a variable you set (or the image's `ENV`) wins. Start it from that
  directory: the runtime reads its artifacts and writes `runtime/` and SQLite files relative to the cwd.

  ```bash
  cd dist/apps/<appName> && PORT=3100 bun main.js
  ```

- **A server a test boots in-process takes `start({ listen: false, schedules: false })`** to run no internal
  (init, interval, cron, queue worker); `listen: false` alone still runs them, as a batch replica does. A server
  process a test spawns from source resolves the workspace from its cwd and gets the root `.env` from Bun, so
  spawn it inside the repo with `bun --no-env-file`, or spawn the built `dist/apps/<app>` output, which needs
  neither.

## Logging — Records, Request Context And Live Tail

Every `Logger` call builds a `LogRecord` before any text exists: `at`, `level`, OTel `sev`, `name`, `message`,
`pid`, `replicaIdx`, `role` (`gateway` / `all` / `batch` / `rsc-worker`) and — inside a call — `traceId`,
`endpoint` (`mutation:signScContract`, `internal:cleanupJob`, `page:/org/[orgId]`) and `origin` (`http`,
`websocket`, `mcp`, `internal`, `page`). The console line is rendered from the record and is byte-identical to
what it was; a sink reads `entry.record` and renders only if it touches `entry.message`.

The level ladder is `trace verbose debug info warn error`. `log` was a seventh tier *below* `info` that
`AKAN_PUBLIC_LOG_LEVEL=info` silently dropped; the method is kept and emits at `info`, so
`no-deprecated-log-level.grit` refuses a call to it — write `.info()`. `AKAN_PUBLIC_LOG_LEVEL=log` still boots,
normalized to `info` with one warning.

- **Request context is on by default, production included.** `SignalContext.try` / `SignalContext.run` own the
  `AsyncLocalStorage` scope for the whole call, including the 500 log, so every line of one request shares a
  `traceId`. Internal triggers get `internal:<key>`, the RSC worker gets `page:<route>`, MCP calls are the
  endpoint's own type with `origin: "mcp"`. `AKAN_LOG_CONTEXT=0` is the escape hatch; `AKAN_TRACE=1` is a
  different switch that adds span and query aggregation. Measured cost: ~25ns per call.
- **Not everything carries context, by design.** The primitive query fast path (an unauthenticated GET of a
  primitive with no args, guards or middlewares) skips it; the schedule adaptor's own `started/finished/error`
  lines wrap the traced handler from outside; gateway-internal lines have none. `akan logs --endpoint` says so.
- **`Logger.addSink(sink, { minLevel })` — give a sink its floor.** A sink with none follows `AKAN_LOG_FILE_LEVEL`
  (default `trace`), which is why a registered sink used to make every `verbose` call render (1,294ns against an
  11ns reject). The IPC forwarder and any sink that never reads the text pass a floor and cost a record literal.
- **The hub lives with whoever owns the surface**: the gateway when there is one, the replica itself under solo
  (`AKAN_REPLICA=0,0,1`), the same rule as the rotating log file and `/_akan/app/*`. It keeps a ring
  (`AKAN_LOG_BUFFER` records / `AKAN_LOG_BUFFER_MB`, default 2000 / 4), suppresses a line repeating more than 20
  times a second into one counted line there and in live tails (never a request line; the ndjson stdout and the log
  file get every record), and serves `<runtimeDir>/akan-control.sock` (`0600`, NDJSON). A child
  forwards records only while a subscriber wants that level (`log.level` IPC), so an unwatched process sends
  nothing; `AKAN_LOG_STREAM=1` keeps it on. The RSC worker forwards to its replica the same way.
- **`akan logs <app>`** is the client: `--level --grep --endpoint --trace --child --role --origin --since`
  AND together, comma lists OR, `*` is the only glob; `--replay N` first, `--follow false` for history only,
  `--json` for NDJSON, `--runtime-dir` for a built app. Inside `akan console`, `.tail level=warn grep=payment`,
  `.tail off`, `.trace <id>` — the console is its own `listen: false` process, so these attach to the running
  server's socket rather than reading their own logs.
- **The generated Dockerfile sets `AKAN_LOG_TO_FILE=0`.** A container's writable layer is ephemeral and nothing
  collects a file from it; stdout is the collection path. A deployment that wants the files back sets
  `AKAN_LOG_TO_FILE=1`; they are created 0600, so a collector running as another user needs `AKAN_LOG_FILE_MODE`
  (octal, e.g. `640`), and a file already there keeps its mode.
- **`AKAN_LOG_FORMAT=ndjson` makes the container's stdout one JSON record per line, and the hub owner (gateway or
  solo replica) its only writer** — every other server process turns its console off and forwards from
  `AKAN_LOG_STDOUT_LEVEL` (default: the console level); a child's or the RSC worker's crash stack is wrapped as a
  `raw=true` record instead of breaking the stream. Text stays the default; turn it on in the deployment.
- **`AKAN_LOG_STREAM_TOKEN` mounts `/_akan/app/logs`** (SSE, `Last-Event-ID` resume, explicit `gap` events;
  a client that stops reading holds at most 4 MiB, hears `{type:"dropped",count}` when it reads again, and is cut off
  past 10,000 dropped records);
  unset, the route does not exist. The same bearer also unlocks the health detail and metrics.
- **`AKAN_LOG_CANONICAL=1|slow`** writes one `ok|error <endpoint> ms= status=` line per call, at `info`, `warn` under
  500, or `error` with `type` and `stack` for a 5xx (then the only 5xx record); **`AKAN_LOG_FLIGHT=1`**
  keeps each call's last 64 sub-level records and promotes them (`flight=true`) only when it failed or ran past
  `AKAN_LOG_FLIGHT_MS`; an `x-akan-debug` header lowers one request to `trace` — under the local dev runtime, or
  with the `AKAN_LOG_DEBUG_HEADER` secret.
- **Structured values go in `LogRecord.attrs` via `Logger.emit(...)`**; a key naming a secret is `[redacted]`
  before the record exists.
- **Never log per delivered record in anything that delivers records.** The control socket and the hub do not,
  and a subscriber asking for everything is the test.

## The Generated Image — `docker` In `akan.config.ts`

**`docker` is `string | { image, preRuns, postRuns, command }`** — a whole Dockerfile, or the parts Akan
assembles one from. There is no `content` field; the string *is* the content.

```ts
const config: AppConfig = {
  docker: { preRuns: ["apt-get update && apt-get install -y --no-install-recommends ffmpeg"] },
};
const config: AppConfig = { docker: "FROM oven/bun:1.4.4-slim\n…" }; // verbatim, nothing merged in
```

- `image` and each run entry take `string | { amd64?, arm64? }`; the object form compiles to a
  `RUN if [ "$TARGETARCH" = "<arch>" ]` guard, so a multi-arch build runs it on one leg only. `preRuns` land
  before `bun install --production` (where a native dependency's build tools have to be), `postRuns` after it
  and before the app files are copied.
- **The image installs the versions the workspace locked.** `akan build` writes a `bun.lock` beside the image's
  `package.json`, cut down from the workspace's to what the server needs, and the image installs it
  `--frozen-lockfile`. A workspace without a root `bun.lock` gets a warning and an unlocked install; a Dockerfile
  written whole copies `bun.lock` itself.
- **A lib declares the steps its own runtime needs**, and every app that mounts it inherits them:
  `libs/<lib>/akan.config.ts` takes `docker: { preRuns, postRuns }` and nothing else — the base image and the
  command belong to the app. Lib steps are emitted before the app's own, and an identical step declared twice
  becomes one layer.
- **The string form takes no contributions.** A Dockerfile handed over whole is used exactly as written, so a
  lib's `preRuns` are dropped rather than spliced into a file Akan does not own. An app that needs both writes
  the parts instead.
- Like `externalLibs`, lib steps are collected from **every lib in the workspace**, not just this app's
  dependency closure — narrowing that set needs the dependency scan, and this config is re-read on every file
  change in dev. Keep a lib's steps to what its runtime genuinely requires.
- `AkanAppConfig.docker` is the resolved declaration; `AkanAppConfig.dockerfile` is the text `akan build` writes
  to `dist/apps/<app>/Dockerfile`.
