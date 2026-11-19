<!-- akan:generated -->

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
- **Errors to a tracker go through `option.setErrorReporter(fn)`**, never a `Logger` sink parsing lines. It gets each
  server 5xx (never a 4xx), render error, uncaught exception and unhandled rejection as a real `Error`, once, after
  the response, with `{ source, traceId, endpoint, routeId, accountId, digest }`, in the solo server or the replica
  (a worker's render error is carried to it; the gateway reports none). Reports of one request share `traceId`. A
  process hands it at most 600 errors a minute, 10 of them process errors, and 3 render errors a request, so `await`
  what the reporter sends: an unawaited send that fails returns as an unhandled rejection. `option.setClientReport({
  sampleRate })`, off unless set, adds what pages hit in the browser as a `BrowserError` through
  `/_akan/client-report`: a report is taken only with the signed id the page's `Server-Timing` gave that page view,
  for 30 to 60 minutes and five times, and its text is cleaned of query strings, email addresses and credentials. A
  native app's bundled page, from another origin, gets its id by a `GET` from a shell origin (`app://localhost`,
  `https://app.localhost`), counted per address and sampled like a page view, and its reports carry `shell`. With
  more than one gateway or pod, set `AKAN_CLIENT_REPORT_KEY` (a secret, 32+ characters, the same on each) so each takes the others' ids.
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

## The Generated Image — `docker` In `akan.config.ts`

**`docker` is `string | { image, preRuns, installRuns, postRuns, command, crossBuild, env, variants }`** — a whole
Dockerfile, or the parts Akan assembles one from. There is no `content` field; the string *is* the content.

```ts
const config: AppConfig = {
  docker: { preRuns: ["apt-get update && apt-get install -y --no-install-recommends ffmpeg"] },
};
const config: AppConfig = { docker: "FROM oven/bun:1.4.4-slim\n…" }; // verbatim, nothing merged in
```

- `image` and each run entry take `string | { amd64?, arm64? }`; the object form compiles to a
  `RUN if [ "$TARGETARCH" = "<arch>" ]` guard, so a multi-arch build runs it on one leg only. `preRuns` land
  before `bun install --production` (where a native dependency's build tools have to be), `postRuns` after it
  and before the app files are copied. An `image` object picks each leg's base by `TARGETARCH`.
- **`installRuns` are chained onto `bun install` in one `RUN`**, each in its own subshell, so what a step deletes
  from `node_modules` is in no layer: prune a package that ships every platform's binary there. An `rm` in
  `postRuns` is a later layer.
- **`crossBuild: true` installs on the build machine for the target** (`buildx --platform linux/arm64` on amd64,
  where Bun under QEMU crashes): a `FROM --platform=$BUILDPLATFORM` stage runs `bun install --os linux --cpu
  <target>` and `installRuns`, and the target's stage copies its `/workspace` and runs `apt-get`, `preRuns` and
  `postRuns` under emulation, so a `bun` command in those crashes the same way. A dependency's lifecycle script
  then runs on the build machine's CPU, where `preRuns` never ran, so one that downloads or compiles a native
  binary gets the build machine's. It needs BuildKit (an `image` object does too), and a string `image` published
  for the build machine.
- **`env` sets the image's defaults; `variants` writes a second image.** `env: { EDGE_MODE: "camera" }` is laid
  over the build's `ENV` lines (`AKAN_PUBLIC_OPERATION_MODE` too): tracked and readable, so never a secret, and not
  given to `bun main.js` on a host. `variants: { edge: { … } }` writes `Dockerfile.edge` (`docker build -f`): the
  app's `docker` with each field it names replaced whole, so `preRuns: []` drops the app's steps; lib steps reach
  every variant. Split an image by purpose (a device, a control plane) this way, not by `{ amd64 }`.
- **`akan build` writes a `.dockerignore`**: `sqlite`, `local`, `runtime`, `data`, `.akan/artifact/image-cache` and
  `node_modules`, so the database a build run by hand wrote beside `main.js` stays out of `COPY . .`.
- **The server runs as `USER 1000:1000`, oven/bun's `bun` user, and owns only the directories it writes.** The
  build steps (`apt-get`, `preRuns`, `bun install`, `postRuns`) run as root and the app files stay root's, so
  `main.js`, `server.js`, `public/` and `node_modules` are read-only to the server. After the copy, uid 1000 gets
  `/workspace/sqlite`, `/workspace/local`, `/workspace/runtime` (the control socket), `/workspace/data` and
  `/workspace/.akan/artifact/image-cache`; `/tmp` and `/home/bun` are writable too. A directory a `postRuns` step
  makes for the server to write needs `chown 1000:1000`. An empty named volume takes the owner of the directory it
  mounts over; one a root image already wrote is owned by root, so the server stops at boot with
  `directoryNotWritable`, naming the directory and the `chown -R 1000:1000` that fixes it.
- **The server starts under an init**: the entrypoint is `tini -s --` and `command` is what it runs, so `bun` is
  not PID 1. A process whose parent dies first (the `ffmpeg` of a killed `sh -c '… | ffmpeg'`) is handed to PID 1,
  and Bun never waits for a child it did not start: each one stayed `<defunct>` for the container's life. tini reaps
  them, passes every signal on to the server and exits with its code, and `-s` keeps that true under
  `docker run --init` or a shared process namespace. `docker run <image> bun main.js ops …` runs under it as well.
  A Dockerfile written whole brings its own init.
- **A device node needs its group beside `--device`.** The server is uid 1000 with no other group, and a node such
  as `/dev/video0` is `root:video 660` on the host: `docker run --device /dev/video0 --group-add "$(stat -c %g
  /dev/video0)"`, the host's numeric gid, since the number behind `video` or `render` differs between systems. In a
  pod it is `securityContext.supplementalGroups`.
- **The base image is pinned by digest**, `oven/bun:<bun>-slim@sha256:…`, the multi-arch index's, so amd64 and
  arm64 build from the same release; a test holds the tag to the Bun version the workspace's `package.json` pins.
- **The image installs the versions the workspace locked.** `akan build` writes a `bun.lock` beside the image's
  `package.json`, cut down from the workspace's to what the server needs, and the image installs it
  `--frozen-lockfile`. A workspace without a root `bun.lock` gets a warning and an unlocked install; a Dockerfile
  written whole copies `bun.lock` itself.
- **A lib declares the steps its own runtime needs**, and every app that mounts it inherits them:
  `libs/<lib>/akan.config.ts` takes `docker: { preRuns, installRuns, postRuns }` and nothing else — the base image,
  the command, `crossBuild`, `env` and `variants` belong to the app. Lib steps are emitted before the app's own, and an identical step declared twice
  becomes one layer.
- **The string form takes no contributions.** A Dockerfile handed over whole is used exactly as written, so a
  lib's `preRuns` are dropped rather than spliced into a file Akan does not own. An app that needs both writes
  the parts instead.
- Like `externalLibs`, lib steps are collected from **every lib in the workspace**, not just this app's
  dependency closure — narrowing that set needs the dependency scan, and this config is re-read on every file
  change in dev. Keep a lib's steps to what its runtime genuinely requires.
- `AkanAppConfig.docker` is the resolved declaration; `AkanAppConfig.dockerfile` is the text `akan build` writes
  to `dist/apps/<app>/Dockerfile`.

## An Image On A Device — A LAN Host With No Domain

A board reached by IP on a private network runs the image a cloud deployment does: built for a real environment,
told it is an edge, with its data on volumes.

```sh
AKAN_PUBLIC_REPO_NAME=<repo> AKAN_PUBLIC_SERVE_DOMAIN=<site>.internal akan build <app> --env main
docker build -t <app> dist/apps/<app>   # on the device, or with --platform linux/arm64 where it is built
docker run -d --restart unless-stopped -p 80:8282 --env-file /etc/<app>.env \
  -e AKAN_PUBLIC_OPERATION_MODE=edge -v <app>-sqlite:/workspace/sqlite -v <app>-local:/workspace/local <app>
```

- **Build for the environment, not `local`.** A `local` build's Dockerfile stops without
  `--build-arg AKAN_ALLOW_LOCAL_IMAGE=1`, because that server runs without endpoint rate limits and on local
  defaults; `AKAN_RATE_LIMIT=on` restores the budgets in an image built that way anyway. `--env main` bundles
  `env/env.server.main.ts`.
- **The serve domain is a name, not a host the device must answer.** A build for any environment but `local` stops
  until `AKAN_PUBLIC_REPO_NAME` and `AKAN_PUBLIC_SERVE_DOMAIN` are set, in the workspace `.env` or the shell. The
  domain only forms `<app>-<env>.<serveDomain>`: the host a CSR bundle (a native app, a `?csr=true` page) calls
  over HTTPS. A server-rendered page calls the origin it was loaded from, so a browser on `http://192.168.0.20`
  never resolves it, and a deployed server answers every `Host`. With no domain, give it one nothing resolves
  (`<site>.internal`); a native app that must reach the device is built with
  `AKAN_PUBLIC_SERVER_URL=http://<device>:<port>`.
- **`AKAN_PUBLIC_OPERATION_MODE=edge`** replaces the image's `cloud`: `/mcp` stays off unless `AKAN_MCP=true`, and a
  module that lists `operationMode: ["edge"]` mounts. `akan build --profile edge` also bundles
  `env/env.server.main.edge.ts`, which may hold no secret, in place of `env/env.server.main.ts`.
- **Database mode `single` needs no Redis and no setting** when it is the only mode declared; with several,
  `-e AKAN_DATABASE_MODE=single`.
- **Secrets come from the env file**, kept outside the image: whatever `akan secret-env <app> --env main` lists,
  and `JWT_SECRET` for an app on `libs/util`, whose boot stops with `jwtSecretRequired` outside operation mode
  `local`.
- **Two directories hold the data**: `/workspace/sqlite` (the database, the cache and queue files, snapshots) and
  `/workspace/local` (uploads). `/workspace/data` is writable for the app's own files. A named volume takes uid
  1000 from the image; a host directory bound in needs `chown 1000:1000`.
- **Plain HTTP keeps no browser session.** Outside operation mode `local` the session cookie is `Secure` and named
  `__Host-…`, which a browser accepts over HTTPS only: an app people sign in to from a browser needs TLS in front
  of the device.
- A camera or an accelerator is a device node: `--device` with its group, as the image section says.

## Server Env Secrets — Read From The Process Env

`akan build <app>` puts no secret value of the server env into the server it builds. The env file stays the one
place a developer writes them; the build turns each into a read of an environment variable the deployment sets.

- **What is a secret.** A string under a secret-named key at any depth below it, unless blank, or a URL carrying a
  password or a secret-named query parameter. The names are the ones the logger masks: `password`, `pass`, `pwd`,
  `token`, `jwt`, `secret`, `cookie`, `authorization`, `apiKey`, `aesKey`, `privateKey`, `accessKey`, `authKey`,
  `hashKey`, a signing, encryption, master or session key, `webhook`, `credential`, a `dsn`, a connection string,
  `iapVerify`, `serviceAccount`, `cred(s)`. Numbers, booleans and `null` never are. The rule over-matches
  (`cookieDomain`, `tokenTtl` as a string), which only means the deployment sets that value too; it misses a key such
  as `stripeKey` or `salt`, which stays in the build unless the env file reads `process.env.<NAME>` itself.
- **Its variable** is its key path, each key in upper snake case and joined with `__`:
  `security.sso.google.clientSecret` is `SECURITY__SSO__GOOGLE__CLIENT_SECRET`, `iapVerify.google.private_key` is
  `IAP_VERIFY__GOOGLE__PRIVATE_KEY`. Four keep the names the framework already reads ahead of the env file:
  `security.jwtSecret` is `JWT_SECRET`, `database.postgres.url` is `POSTGRES_URL` (`POSTGRES_URI` satisfies it),
  `database.postgres.password` is `POSTGRES_PASSWORD`, `database.postgres.insightUrl` is `POSTGRES_INSIGHT_URL`.
  An array holding a secret moves whole into one variable holding JSON (`discord.tokens` is `DISCORD__TOKENS`,
  `["a","b"]`). An object is never one variable: each secret string in it is its own. A multi-line value (a PEM key)
  is carried with its real line breaks.
- **What the build rewrites** is source text: a string literal that is the value of a key in the object
  `export const env` holds, in the app's `env.server.<env>.ts`, in `env.server.ts` itself where a pipeline copies an
  env file over it, and in each lib's `env.server.<name>.ts`. In `process.env.MY_URL ?? "literal"` only the literal
  becomes the read, so the developer's own variable comes first. Two keys that map to one name (`apiKey` and
  `api_key`), and a name the platform or akan owns (`PATH`, `HOME`, `HOSTNAME`, `PORT`, `USER`, `PWD`, `TZ`,
  `NODE_ENV`, `AKAN_*`, `BUN_*`), stop the build before it starts.
- **What stops a build.** Before any phase the build loads the env file with each literal marked, to list the
  variables and to see what it cannot move. A secret-named key whose value is computed, imported or spread from
  another file stops it there, whatever the value's length or shape, naming the app, the env file and the keys:
  write the string at the key, or `process.env.<NAME>`. A key the env file reads from `process.env` itself is the
  developer's own: it is not moved, never stops the build, and the bundle holds the read and no value, set in the
  build's shell or not. After the bundles are written the build looks in `dist/apps/<app>` for each secret string it
  left out, eight characters or longer: a long mixed one found there stops the build, naming its key, its variable
  and a plain key of the env that holds it too; a short or plain one (a password equal to a database's name) is a
  warning by the same names, as is a shorter string a plain key holds as well. No message prints a value.
- **How the env file is loaded.** In a process with `PATH`, `HOME` and `AKAN_PUBLIC_ENV` alone, so the list is the
  same from any shell and `process.env.X ?? fallback` reads as the fallback the bundle carries. A file that cannot
  load so (`process.env.HOSTS!.split(",")`) is loaded again with the build shell's variables, where a value a
  variable gave counts as the developer's read. One that loads neither way stops the build with the error's class
  and its file and line, never its message, which could quote a value; loading has a 60 second limit, and a file
  that leaves a timer or a server open still ends when its answer is in.
- **What the image carries** is the list: `AKAN_ENV_NAMES` in `akan.env.json` and the Dockerfile, names with
  `:json` or `:multiline` after an array or a multi-line value, never a value. The build prints the names.
- **At boot**, in `AkanApp.start` before the server is loaded or a replica is spawned, the list is compared with the
  process env. A variable not set, or set empty, is one warning naming every such variable. The framework does not
  stop for it, and what reads the value gets `undefined` and may stop (an app that requires its
  JWT secret does); version 3.5.0 will refuse to boot. A `:json` variable that does not parse as an
  array is refused (`secretEnvInvalid`). A `:multiline` variable holding a backslash and an n in place of its line
  breaks is warned about by name. No message carries a value. `bun console.js` and `bun main.js ops …` do not
  check.
- **`akan secret-env <app> [--env <env>]`** lists each variable with its kind, whether the shell sets it, and its key
  in the env file. `--out <file>` writes the values the env file evaluates to: `--format k8s` (the default) a
  `kind: Secret` with base64 `data`, named by `--name` (default `<app>-env`); `--format dotenv` `NAME=value` lines
  quoted so that Bun's loader reads each back unchanged. The file is created readable by its user alone. A path
  under `dist/`, a path git would track and an existing file (without `--force`) are refused. The file holds the
  secrets: apply or import it, then delete it.
- **Giving the server its variables.** Kubernetes: apply the Secret and name it in the container's `envFrom`; a
  Secret that is missing stops the container before boot. Docker: `-e NAME=value`; `docker run --env-file` takes
  each line as written, so of the dotenv file it reads the unquoted values and no quoted or multi-line one.
  A host: `bun --env-file=<file> main.js`, with the file outside `dist/apps/<app>`, which an image copies whole.
  Every replica and the RSC worker inherit the gateway's env, so a changed Secret reaches a pod only when it
  restarts.
- **`akan build <app> --inline-secrets`** keeps each value in the build as what its read falls back to, for a
  deployment that does not set the variables yet; a variable that is set still wins, the boot warning says the
  built-in values are in use, and nothing above stops it: a computed or imported secret stays, the files written are
  not searched, and an env file that cannot be loaded is a warning, after which the env files are bundled as
  written and no variable is read. Version 3.5.0 removes the flag.
- **Read as written, as before:** `akan start` and `akan test` (the env file is imported from source), a
  `--profile` build (its profile file may hold no secret at all), and the server a desktop or mobile build carries.
- **Not covered:** a key file an env value names by path (`security.sso.apple.keyFilePath` under `private/`) ships
  with `private/`; mount it instead. Images built before 3.4.0 still hold the values: rotate the secrets once the
  new images are live.
