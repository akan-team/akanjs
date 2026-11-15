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
  value, anything out of `implicitRootLayout` — is always too late. The value rides the data block the SSR classic
  bootstrap script reads instead, the one thing guaranteed to run ahead of every module script, and is omitted when
  it matches what the bundle already assumes. `akan.config.ts` is what a native app bundle or a statically served CSR shell
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
- **A render worker starts every render it is sent, unless `AKAN_RSC_WORKER_MAX_CONCURRENCY` caps it.** With a
  cap, that many renders run in one worker (so per replica) and the rest wait first come, first served: documents,
  `/__rsc` navigations and prefetches, and a failed render's error page. A stored page is replayed without a slot,
  after a wait too; an aborted request leaves the queue, and a slot comes back when its render ends, throws, is
  cancelled, or has held it as long as `AKAN_IDLE_TIMEOUT` (120 s, also where that is `0`); MCP page prompts are not
  queued. `AKAN_RSC_WORKER_MAX_QUEUE` bounds the queue (default: the cap times that timeout's seconds, `0` for
  none): a render past it, or one that waited that timeout, is answered `503` with `Retry-After: 1` and `no-store`
  before it renders (`renderQueueFull`, `renderQueueTimeout`; a browser gets a page that reloads once, backing
  off), counted as its route's `5xx` and in `akan_rsc_render_refusals_total{reason}`, which counts a slot taken
  back as `hold-timeout`. `akan_rsc_renders_in_flight`, `akan_rsc_render_queue_depth` and
  `akan_rsc_render_queue_wait_seconds` report the queue; a page that waited carries `queueMs` on its request line.
  The cap bounds admitted renders, not abandoned ones: a page whose slot came back runs on until its own `await`
  settles, counted in `akan_rsc_renders_abandoned`.
  Off by default, because a page that awaits data holds its slot: on `apps/akan` at 32 requests at once, pages
  waiting 20–200 ms on data served 151 requests a second uncapped and 32 at a cap of 4, while CPU-bound pages
  served about 105 at any cap with the same median latency. It bounds a burst, not latency: set it to the requests
  one replica is sized for; the table is in `pkgs/akanjs/server/SSR_MEMORY_DIAGNOSIS.md`.
- **A solo process answers `/_akan/app/health`, `/_akan/app/metrics` and `/_akan/bench/ping` itself**, in the
  gateway's own shape — a `children` array with one entry — so a probe reads one contract either way. It owns the
  rotating log file the gateway would otherwise write, in the same `runtime/logs` directory.
- **Health detail and metrics answer only `Authorization: Bearer $AKAN_STATUS_TOKEN`** (or the log stream token)
  outside the local dev runtime — `AKAN_PUBLIC_ENV` and the operation mode both `local`, under `akan start` or a
  `NODE_ENV` other than `production`, so a built server stays closed: without it `/_akan/app/health` is `{ status }`
  alone (still 200) and `/_akan/app/metrics` is 401. An address that sends 10 wrong bearers in a minute is refused
  the right one too until the minute passes. A probe that reads only the status code needs nothing; give a scraper or
  monitor `AKAN_STATUS_TOKEN` (32 characters or more, or it warns), which reads nothing else.
- **`/_akan/app/metrics` answers a Prometheus scrape as text**, behind the same token: `Accept:
  application/openmetrics-text` gets OpenMetrics 1.0 and `text/plain` the 0.0.4 text, while `*/*`,
  `application/json` or no Accept keeps the JSON, whose `metricFamilies` carries the same series. Every endpoint and
  page call is counted and timed with tracing off — `akan_endpoint_requests_total{endpoint, status_class}`,
  `akan_page_requests_total{route, status_class}` and their `_duration_seconds` histograms (12 buckets, 1 ms to
  10 s) — labelled `<type>:<key>` or the route id and the process `role`, never a URL, user or query; a path no
  route matches is `unmatched`, and a label past 2,000 values is `other`. Behind a gateway each replica reports its
  own and the gateway adds them, as fresh as `AKAN_MEMORY_LOG_INTERVAL_MS`. A new series is one line,
  `metricRegistry.counter|gauge|histogram(name, help, labels)` from `server/metrics/metricRegistry`, in the server
  or in its RSC worker, whose series reach the same scrape as fresh as that interval and survive a worker restart. The
  `infra/app` chart adds the `prometheus.io/*` scrape annotations with `<branch>.metrics.scrape: true` and reads the
  token from the Secret `<branch>.metrics.tokenSecret` names, and refuses to render `scrape` without it;
  `infra/monitoring` holds a Grafana dashboard and the alert rules.
- **Each SQL statement is timed once, where its driver sends it**; the `db:` spans, the `akan_db_statement*` series
  (labels `model`, `op`; the SQLite write-turn or Postgres pool wait apart) and the slow log read that
  point. A fingerprint hashes the text with literals `?` and lists collapsed; the text sent never changes.
  `/_akan/app/statements` (metrics token) ranks statements by total time and p95 with their senders.
  `AKAN_LOG_SLOW_STATEMENT_MS` (200, `off`) logs one `SlowStatement` warn per fingerprint a minute; a local dev run
  warns once (`QueryPlan`) of a full scan or temp sort, silenced per fingerprint by `AKAN_QUERY_PLAN_IGNORE`.
  `akan_room_replay_bytes` and `akan_pubsub_buffered_messages` gauge the reconnect replay and the Redis buffer.
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
- **One id per request, across processes.** The `traceId` is 32 hex digits (a W3C trace id), written on the response
  as `x-request-id` and in a failed call's body as `traceId`. The server always mints it: an inbound `traceparent`,
  or else an `x-request-id` that is a UUID or 32 hex digits, is kept as `link` on every record of the request, and
  `akan logs --trace` matches `link` too and takes the id as the caller sent it. Only the gateway's unix-socket hop
  to its replica carries an id over. `AKAN_TRACE_ADOPT=trusted-proxies` lets a peer `AKAN_TRUSTED_PROXIES` names
  (an address, a CIDR, or `private`; never the unset default, `*`, or loopback unlisted) choose the id, which is
  safe only when that proxy overwrites or strips both headers. The replica hands its id to the RSC worker in the
  render message, a server-side `fetch` sends `traceparent` to the app's own server and to a `clone({ origin })`,
  every websocket frame is a span under its handshake's id, and a queued job is a trace of its own that links the
  enqueuing one.
- **Not everything carries context, by design.** The primitive query fast path (an unauthenticated GET of a
  primitive with no args, guards or middlewares) skips it; the schedule adaptor's own `started/finished/error`
  lines wrap the traced handler from outside; gateway lines written outside a request have none. `akan logs
  --endpoint` says so.
- **`Logger.addSink(sink, { minLevel })` — give a sink its floor.** A sink with none follows `AKAN_LOG_FILE_LEVEL`
  (default `trace`), which is why a registered sink used to make every `verbose` call render (1,294ns against an
  11ns reject). The IPC forwarder and any sink that never reads the text pass a floor and cost a record literal.
- **The hub lives with whoever owns the surface**: the gateway when there is one, the replica itself under solo
  (`AKAN_REPLICA=0,0,1`), the same rule as the rotating log file and `/_akan/app/*`. It keeps a ring
  (`AKAN_LOG_BUFFER` records / `AKAN_LOG_BUFFER_MB`, default 2000 / 4), suppresses a line repeating more than 20
  times a second into one counted line there, in live tails and in the log file (never a request line; the ndjson
  stdout gets every record), and serves `<runtimeDir>/akan-control.sock` (`0600`, NDJSON). A child
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
  a client that stops reading holds at most 4 MiB of live records beyond a resume's replay, hears `{type:"dropped",count}` when it reads again, and is cut off
  past 10,000 dropped records);
  unset, the route does not exist. The same bearer also unlocks the health detail and metrics.
- **`AKAN_LOG_CANONICAL=1|slow`** writes one `ok|error <endpoint> ms= status=` line per call, at `info`, `warn` under
  500, or `error` with `type` and `stack` for a 5xx (then the only 5xx record); **`AKAN_LOG_FLIGHT=1`**
  keeps each call's last 64 sub-level records and promotes them (`flight=true`) only when it failed or ran past
  `AKAN_LOG_FLIGHT_MS`; an `x-akan-debug` header lowers one request to `trace`, records its spans and answers with
  `Server-Timing` — under the local dev runtime, or with the `AKAN_LOG_DEBUG_HEADER` secret. A local runtime sends
  `Server-Timing` on every signal response. Spans carry ids, parents and start offsets; under `AKAN_TRACE=1` each
  SQL statement sent is a `db:<model>.<op>` span, never its text or values.
- **`OTEL_EXPORTER_OTLP_ENDPOINT` (or `…_TRACES_ENDPOINT` / `…_LOGS_ENDPOINT`) turns on OTLP/HTTP JSON export**;
  with none set nothing is created. Each process sends its own spans and log records with `akan.process.role`, the
  RSC worker included, batched in a bounded queue that drops its oldest and never blocks or throws into a request.
  `OTEL_TRACES_SAMPLER` (`always_on`, `always_off`, `traceidratio` and their `parentbased_` forms, default
  `parentbased_always_on`; any other value exports no spans) decides at the first TCP hop, and the sampled flag of
  `traceparent` carries it to the replica and the worker. Logs go only with `OTEL_LOGS_EXPORTER=otlp` or
  `…_LOGS_ENDPOINT`, never from the generic endpoint alone, their message text as written; only secret-named attrs are
  redacted. Stage spans wait for `AKAN_TRACE=1`. `OTEL_EXPORTER_OTLP_HEADERS` values are credentials, never
  logged; `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES` and `OTEL_SDK_DISABLED` work as in the OTel spec. It is
  separate from `AKAN_TRACE` and `x-akan-debug`: neither changes what is sampled.
- **Every dev route is listed once, in `akanjs/server/routing/devSurfaces`** — devtools, Studio, `/_akan/hmr`,
  the ssr-dev and csr-dev module registries, `/__rsc/manifest` — and is mounted through `DevRoutes.mount`, which
  refuses a path the list lacks. Each answers only localhost, an IP address, the app's own hosts and
  `AKAN_ALLOWED_HOSTS` names, even on a server that answers every Host; `--share` serves only the two module
  registries. Devtools opens in the local dev runtime; elsewhere `AKAN_DEVTOOLS=true` opens it only with
  `AKAN_LOG_DEBUG_HEADER` set to at least 32 characters, to `x-akan-debug: <secret>` or a browser that posted the
  secret to the form it is shown (a 15-minute cookie); without one that long it stays closed and the log says why.
- **Structured values go in `LogRecord.attrs` via `Logger.emit(...)`**; a key naming a secret is `[redacted]`
  before the record exists.
- **Never log per delivered record in anything that delivers records.** The control socket and the hub do not,
  and a subscriber asking for everything is the test.
