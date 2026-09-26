# Runtime Rule — Serving, Processes, Logging, Image, Assets

How an Akan app is built, what it serves, how many processes it runs, where its logs go, and what ends up in
its image. Everything here is declared in `akan.config.ts` or narrowed by an env at boot; none of it is reached
from domain code. `conventions` carries the invariants — this is the full contract behind them.

## Web Surfaces — Building And Serving Without SSR/CSR

An app serves three things: the API, the SSR/RSC web renderer, and the CSR single-file bundle. The API is always
on; the other two are declared in `akan.config.ts` as **`web: true | false | { csr: boolean }`** and can be
narrowed again per deployment.

```ts
const config: AppConfig = { web: { csr: false } }; // web without the mobile bundle
const config: AppConfig = { web: false }; // api only
```

- **`web: { csr: false }`** drops the CSR build phase and the `/__csr` + `?csr=true` routes. The CSR bundle is
  what the Capacitor mobile build ships, so a web-only deployment never needs it — and an app that declares a
  `mobile` section is refused, because `akan build-ios` copies `dist/apps/<app>/csr/<target>.html` into the
  native project.
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
  what the bundle already assumes. `akan.config.ts` is what a Capacitor bundle or a statically served CSR shell
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
  times a second into one counted line, and serves `<runtimeDir>/akan-control.sock` (`0600`, NDJSON). A child
  forwards records only while a subscriber wants that level (`log.level` IPC), so an unwatched process sends
  nothing; `AKAN_LOG_STREAM=1` keeps it on. The RSC worker forwards to its replica the same way.
- **`akan logs <app>`** is the client: `--level --grep --endpoint --trace --child --role --origin --since`
  AND together, comma lists OR, `*` is the only glob; `--replay N` first, `--follow false` for history only,
  `--json` for NDJSON, `--runtime-dir` for a built app. Inside `akan console`, `.tail level=warn grep=payment`,
  `.tail off`, `.trace <id>` — the console is its own `listen: false` process, so these attach to the running
  server's socket rather than reading their own logs.
- **The generated Dockerfile sets `AKAN_LOG_TO_FILE=0`.** A container's writable layer is ephemeral and nothing
  collects a file from it; stdout is the collection path. A deployment that wants the files back sets
  `AKAN_LOG_TO_FILE=1`.
- **Never log per delivered record in anything that delivers records.** The control socket and the hub do not,
  and a subscriber asking for everything is the test.

## The Generated Image — `docker` In `akan.config.ts`

**`docker` is `string | { image, preRuns, postRuns, command }`** — a whole Dockerfile, or the parts Akan
assembles one from. There is no `content` field; the string *is* the content.

```ts
const config: AppConfig = {
  docker: { preRuns: ["apt-get update && apt-get install -y --no-install-recommends ffmpeg"] },
};
const config: AppConfig = { docker: "FROM oven/bun:1-slim\n…" }; // verbatim, nothing merged in
```

- `image` and each run entry take `string | { amd64?, arm64? }`; the object form compiles to a
  `RUN if [ "$TARGETARCH" = "<arch>" ]` guard, so a multi-arch build runs it on one leg only. `preRuns` land
  before `bun install --production` (where a native dependency's build tools have to be), `postRuns` after it
  and before the app files are copied.
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

## Database Modes — `database` In `akan.config.ts`

| mode | database | cache · queue · pubsub | runs as |
|---|---|---|---|
| `single` | SQLite file | SQLite files (Solid) | one container |
| `multiple` | one SQLite file (WAL) on a host volume every container on that host opens | Redis | containers on one host |
| `cluster` | Postgres | Redis | pods on several servers |

- **`database: { modes: ["single", "cluster"] }` is what the build can run in**; the first is what `akan start`
  runs. `akan build` carries the drivers of every declared mode (`multiple` → `bullmq`, `ioredis`; `cluster` adds
  `postgres`).
- **A deployment names its mode with `AKAN_DATABASE_MODE`**, and only a declared one. With one declared mode it may
  leave it out; with several it must name one — the fallback would be a SQLite file inside each pod. `akan start`,
  `build`, `script` and `console` resolve it the same way from the shell. One image can serve an edge site in
  `single` and a cloud cluster in `cluster`: declare both.
- **Where the data lives is the deployment's env, ahead of `env.server.ts`**: `SQLITE_DATABASE_PATH`,
  `AKAN_SOLID_DB_PATH`, `POSTGRES_URL` (or `POSTGRES_HOST`/`PORT`/`DATABASE`/`USER`/`PASSWORD`),
  `POSTGRES_INSIGHT_URL`, `LIBSQL_URL`. `REDIS_URI` is required outside local development. Pool size, SSL and
  prepared statements ride the Postgres URL (`?max=20&ssl=require`, `prepare=false` behind PgBouncer).
- **Uploads**: a deployed `multiple`/`cluster` app uses object storage, or a volume every instance mounts with
  `AKAN_STORAGE_SHARED=true`.
- **`runAdminSql` on Postgres reads as its own login role** holding base-column `SELECT` and nothing else:
  `CREATE ROLE <name> LOGIN PASSWORD '…'` with no other role granted, `POSTGRES_INSIGHT_URL` logging in as it, and
  `GRANT USAGE ON SCHEMA` from the DBA when the app does not own its schema. Every model table grants the role its
  base columns at boot. Without it the console refuses on Postgres; `_doc` is never readable either way.
- **`akan dbup`** starts what the workspace's apps declare (`--mode multiple` is Redis, `cluster` adds Postgres).
  **`akan db-export <app>` / `akan db-import <app>`** move every model table as stored rows through NDJSON files
  (`--dir`, default `local/transfer`) between whatever the shell's `AKAN_DATABASE_MODE` points at; a rerun
  replaces rows, search is rebuilt after, and sessions, queued jobs and uploaded files do not move.
- **`q.raw(sql)` is the dialect's own SQL** — `json_extract("_doc", '$.f')` on SQLite, `("_doc" #>> '{f}')` on
  Postgres. An app that runs in both modes avoids it.

## Operations — Snapshots, Restore And The `/_akan/ops` Channel

`GET /_akan/app/info` answers `{ appName, repoName, environment, operationMode }` on every deployment — the same
`AKAN_PUBLIC_*` values the client bundle already carries — so a control plane can check which app a host is
serving without a key. Everything else is behind the ops channel.

| surface | what it does |
|---|---|
| `bun main.js ops snapshot [--id] [--out] [--include-solid] [--json]` | `VACUUM INTO` a consistent copy, `integrity_check`, sha256, gzip, optional age encryption, `manifest.json` |
| `bun main.js ops restore <manifest.json> [--identity <file>]` | offline only: verify, stage, keep the old file as `<db>.pre-restore-<ts>` (its `-wal`/`-shm` beside it), swap |
| `GET /_akan/ops/info` | the public info plus `akanVersion`, `buildId`, `serverMode`, `databaseMode`, `solo`, `startedAt`, `replicaIdx` |
| `POST /_akan/ops/snapshot` `{ id, includeSolid?, uploadUrls: { main, solid?, manifest } }` | 202; a child process snapshots, then PUTs each file and the manifest **last** |
| `GET /_akan/ops/snapshot/:id` | `running` → `uploading` → `done` \| `failed`; kept in memory, so a restart answers 404 |

- **The entry is the image's own `main.js`** — a production image carries no `akan` CLI. `AkanApp.start()` hands
  `argv[2] === "ops"` to the command before it boots anything. It reads the container's env — the `AKAN_PUBLIC_*`
  identity and the database paths — so run it with that env (`docker compose exec`), never a bare shell's.
- **Restore refuses while an app answers `/_akan/app/health` on `PORT`** and names it by its `/_akan/app/info`;
  `--force` is for a port some other app holds.
- **The channel exists only when `AKAN_OPS_PUBLIC_KEY` is set** (Ed25519: PEM, JWK, base64 SPKI or raw 32 bytes).
  The control plane signs a short EdDSA JWS — `aud`, `iat`, `exp` at most 300s after `iat`, a `jti` the process
  refuses twice — and the host holds only the public half, so a machine someone carries off mints nothing.
  `aud` is `<appName>/<environment>`, or `<appName>/<environment>/<AKAN_OPS_INSTANCE>` when that is set, and then
  only that: a token minted for the app as a whole would replay across every host sharing the name. 30 calls a
  minute per process; every refusal is the same 401. A malformed key leaves the app serving with the channel off.
- **The app holds no storage credential.** It PUTs to the presigned URLs it was handed (`application/octet-stream`,
  the manifest `application/json`), plain http only to loopback. The manifest landing is the commit marker.
- **Snapshots cover the SQLite modes only.** `single` copies the main file and, with `includeSolid`, the Solid file;
  `multiple` copies the main file; `cluster` is refused. Paths follow the adaptors' env precedence
  (`SQLITE_DATABASE_PATH`, `AKAN_SOLID_DB_PATH`, `AKAN_SQLITE_DIR`); a solo process uses the path its adaptor
  actually opened, so a gateway deployment that moved the file in `env.server.ts` names it in the env too.
- **`AKAN_BACKUP_RECIPIENT=age1…[,age1…]` encrypts before upload** — age v1 X25519, so `age -d -i key.txt` opens
  it. Restore takes `--identity` / `AKAN_BACKUP_IDENTITY_FILE`, or a file an operator already decrypted with
  `age -d -o <name without .age>`.
- **The host keeps the newest `AKAN_OPS_SNAPSHOT_KEEP` (default 2) snapshots** under `AKAN_OPS_SNAPSHOT_DIR`
  (default `<db dir>/snapshots/<id>/`) — the copy an edge still has while its uplink or the bucket is down.
- **`buildId` is `AKAN_BUILD_ID` when the deployment sets it**, else the git sha `akan build` wrote into
  `akan.build.json` beside `main.js` (`-dirty` when the tree was).
- **`operationMode` does not gate any of this** — the key does. `edge` means a production host outside the
  cluster: the console refuses it like `cloud`, and `init` / `interval` / `cron` take `operationMode: ["edge"]` to
  run only there. Everything else behaves as `cloud`; `local` is a developer machine.

## Shipped Assets — `assets` In `akan.config.ts`

`akan build` copies the whole `public/` tree into `dist`, lib assets dereferenced, and that copy is the image.
**`assets: { pruneFonts, keepFonts }`** trims the fonts out of it that nothing reads. **Source trees are never
touched** — an app's and a lib's own `public/` keep every file, because one shared font folder is picked over
differently by every app that mounts it and by other repos.

```ts
const config: LibConfig = { assets: { keepFonts: ["fonts/Assistant-*.woff2"] } }; // libs/<lib>/akan.config.ts
const config: AppConfig = { assets: { pruneFonts: false } }; // emergency valve, not the normal escape hatch
```

- **A font with `optimize` on is a build input, not a runtime asset.** `FontOptimizer` subsets it into
  `.akan/artifact/fonts` and the emitted CSS points at `/_akan/fonts/*`, which `WebRouter` serves from the
  artifact — so the source in `public/` is never opened again. That is the bulk of what this drops, and it
  applies to the fonts the app *does* use, not only the ones it does not.
- **The keep-set is derived per app, per build; there is no list of fonts to drop.** An exclude list would rot
  the moment another app or repo started using one of them, and nobody would know to update it. A font survives
  because ① its font declares `optimize: false`, so `FontCss.getRuntimeCss` emits the raw src; ② something
  references its filename — anything under `public/`, the compiled stylesheet, a client/server bundle, the CSR
  shell; or ③ a `keepFonts` glob names it.
- **`keepFonts` belongs to the `akan.config.ts` that owns the font**, written against that lib's or app's own
  `public/` (`"fonts/X.woff2"`, resolved to `libs/<lib>/fonts/X.woff2`). A lib shared across repos carries the
  reason its own CSS needs a font, instead of every mounting app rediscovering it in production.
- **A reference from a build bundle is ignored for an already-subset font.** Every route file's `fonts`
  declaration is inlined into the pages bundle, the client chunks and the CSR shell, so a declared source is in
  all three whether or not anything loads it. `public/` and the compiled CSS are read as authoritative.
- **A generated manifest that lists every public asset keeps every font it names** — a service-worker precache
  file is the usual one. That is a real reference, not a false positive, so the build reports it at `info`:
  read the `[font-prune] kept …` line before concluding the prune does nothing.
- Matching is by filename, including the percent-encoded spelling, so a `url()` survives however it is written.
- The phase is `assets`, between `csr` and `compress`. An api-only build (`web: false`) copies no `public/` and
  the phase finds nothing to do.

