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
  for 30 to 60 minutes and five times, and its text is cleaned of query strings, email addresses and credentials. With
  more than one gateway or pod, set `AKAN_LOG_DEBUG_HEADER` (32+ characters) so each takes the others' ids.
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
- **The server runs as `USER 1000:1000`, oven/bun's `bun` user, and owns only the directories it writes.** The
  build steps (`apt-get`, `preRuns`, `bun install`, `postRuns`) run as root and the app files stay root's, so
  `main.js`, `server.js`, `public/` and `node_modules` are read-only to the server. After the copy, uid 1000 gets
  `/workspace/sqlite`, `/workspace/local`, `/workspace/runtime` (the control socket), `/workspace/data` and
  `/workspace/.akan/artifact/image-cache`; `/tmp` and `/home/bun` are writable too. A directory a `postRuns` step
  makes for the server to write needs `chown 1000:1000`. An empty named volume takes the owner of the directory it
  mounts over; one a root image already wrote is owned by root, so the server stops at boot with
  `directoryNotWritable`, naming the directory and the `chown -R 1000:1000` that fixes it.
- **The base image is pinned by digest**, `oven/bun:<bun>-slim@sha256:…`, the multi-arch index's, so amd64 and
  arm64 build from the same release; a test holds the tag to the Bun version the workspace's `package.json` pins.
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

## Native Apps — The `native` Section

An app's iOS, Android and desktop (macOS, Windows, Linux) apps are the `native` section of its `akan.config.ts`.
Each ships the CSR bundle on the native runtime, so one set of pages serves the web and every app.

```ts
const config: AppConfig = {
  native: {
    appName: "Board",
    appId: "com.example.board", // or one per platform: { default, ios, android, macos, windows, linux }
    version: "1.2.0",
    buildNum: 12,
    indexPath: "/explore", // the first page, and where a deep link's stack and a back with no history land
    permissions: ["camera", "push"],
    plugins: ["file-picker", "keep-awake"],
    deepLinks: { schemes: ["board"], domains: ["board.example.com"] },
    ios: { teamId: "ABCDE12345" }, // universal links for deepLinks.domains
    android: { googleServices: "secrets/google-services.json", sha256CertFingerprints: ["…"] }, // FCM, app links
    desktop: { server: true },
  },
};
```

- **Without `targets` the app has one target, `default`** — the usual case, with every setting in the section
  itself; `native: { desktop: { server: true } }` alone is a whole desktop app that carries its server. Defaults:
  the app's folder name for `appName` and `fileName`, an id made from the repository's and the app's names for
  `appId`, `0.0.1` and `1`.
- **A target is another app made from the section.** It has the section's shape minus `targets` and overrides it
  field by field: plain objects merge key by key — `ios`, `android`, `desktop`, `deepLinks`, `updates` and the
  objects inside them — and every other value replaces the section's, a list included, so a target's `plugins` or
  `permissions` is its whole list. An `icon` or `splash` object is one value. Once `targets` is declared, only the
  targets it names are built:

  ```ts
  native: {
    appId: "com.example.board",
    plugins: ["file-picker"],
    targets: {
      board: {},
      lobby: { appId: "com.example.lobby", plugins: ["file-picker", "keep-awake"], desktop: { recovery: "reload" } },
    },
  },
  ```

- **A platform section may name its own `indexPath`**, which wins on that platform: `indexPath: "/mobile"` with
  `desktop: { indexPath: "/" }` opens the phones on `/mobile` and the desktop app on `/`, from one target, so no
  command needs `--target`. It moves the dev build's first page and the `indexPath` its bundle carries alike.
- **`basePath` is the client a target opens.** An app with no basePaths leaves it out. Without `targets`, the one
  target opens the basePath named like the app when there is one; in an app with basePaths, a target that names
  none is a template, and `--target <basePath>` builds that client from it.
- Every native command takes `--target <name>`. `build-*`, `release-*`, `update-keygen` and `publish-update` also
  take `all`; `start-*` and `pack-update` handle one target at a time.
- **Everything a build makes is under `dist/native/<app>/<target>/`**: `build/<platform>` (`build-ios`,
  `build-android`, `build-desktop`), `dev/<platform>` (the dev builds `start-*` run), `updates` (what
  `publish-update` signs and `pack-update` packs), `web` (the bundle the app loads) and `bin`. It sits outside
  `dist/apps/<app>`, which every `akan build` empties, so a signed release waiting for upload survives the next
  build; `akan start` leaves it alone too.
- **`start-ios` / `start-android` / `start-desktop` run a dev build that loads its pages from `akan start`.** It has
  to be running — except for a desktop app that carries its server, which starts it when none of this checkout
  answers. `--release true` runs a release build of the app's own bundle instead.
- **A desktop app builds only for the computer that builds it** — a `.app` on macOS, and an unsigned folder on
  Windows and Linux. `build-desktop --installer true` adds what a person downloads: a per-user NSIS setup on Windows
  (`/S` installs silently), a dmg on macOS, an AppImage on Linux (it needs `mksquashfs`; an AppImage cannot update
  itself, so a release with `updates` ships a new one). The dmg opens on a drag-to-Applications window with the app's
  icon on the mounted disk, laid out without Finder so CI builds it too; `native.desktop.dmg` (per target as well)
  replaces the background (`background`, `background2x` for Retina) and moves the window and the icons (`window`,
  `iconSize`, `textSize`, `app`, `applications`, in points) — the default background lines up with the default icon
  positions only. `--arch arm64|x64` builds a Windows or Linux app for the
  other CPU of that OS: the Rust library, Bun's executable, the server's `bun install --cpu` and each `bin` file
  follow it, and a server addon with no binary for that CPU stops the build. A macOS app is Apple silicon only —
  Intel Macs are not a target, so `--arch x64` on macOS is refused.
- **A release is signed only with `--sign` and notarized only with `--notarize`** (`build-desktop`,
  `publish-update`); the environment names the identity and never decides to use it, so a shell exporting a Developer
  ID signs and uploads nothing unasked. Every release build and every `publish-update` of a target that carries a
  server, signed or not, first searches that server for every secret value of the workspace's server env files and
  refuses with the paths; an env file it cannot evaluate stops the release too, and a debug build is not searched.
  One line then names the identity and the service the app goes to.
- **A macOS release for download is signed with a Developer ID and notarized.**
  `AKAN_NATIVE_MACOS_IDENTITY` names a keychain identity, or `AKAN_NATIVE_MACOS_CERTIFICATE` +
  `_CERTIFICATE_PASSWORD` a `.p12` the build imports into a keychain of its own (a CI runner);
  `AKAN_NATIVE_MACOS_NOTARY_KEY` + `_KEY_ID` + `_ISSUER` (an App Store Connect API key) or `_NOTARY_PROFILE` are the
  credentials `--notarize` staples the app and the dmg with. Every Mach-O file — the server's addons and `bin` included — is
  signed inside out with the hardened runtime and a timestamp; the executable gets Bun's JIT entitlements and the
  camera's or microphone's when a usage text asks for them, and `desktop.entitlements` adds the app's own.
  `publish-update --sign` signs with the same identity, since the updater checks the installed app's signature. Without a
  Developer ID the build warns, because Gatekeeper blocks a downloaded copy.
- **A Windows release is signed with Authenticode.** `AKAN_NATIVE_WINDOWS_CERTIFICATE` +
  `_CERTIFICATE_PASSWORD` (a `.pfx`), `AKAN_NATIVE_WINDOWS_THUMBPRINT` (a certificate in the store, a token's or an
  HSM's), or `AKAN_NATIVE_WINDOWS_SIGN_COMMAND` (a JSON array run per file with `{file}`, e.g. signtool with Azure
  Trusted Signing's dlib) signs every PE file of the app — the server's `.node` and `bin` included — the setup program
  and the uninstaller it writes, SHA-256 with a timestamp (`AKAN_NATIVE_WINDOWS_TIMESTAMP_URL`).
- **`updates: { url, publicKeys }` lets an installed app update itself** — the whole app on a desktop, the web
  bundle on a phone. `akan update-keygen <app>` makes the signing key once
  (`~/.akan/native/keys/<app id>.update.key`, or the path `AKAN_NATIVE_UPDATE_KEY` names) and prints its public
  key. List the online signing key first and offline spares after it (up to three): a phone binary trusts all of
  them, and a key may revoke only the keys listed before it, so a leaked key cannot lock out its spares. A desktop
  app trusts the first; `publicKey` is the one-key form. `akan publish-update <app>` builds and signs a release
  into `updates/`: upload that release's files to `url` and its manifest last, or let
  `--upload s3://<bucket>/<prefix>` do it (credentials and endpoint from `S3_*` or `AWS_*`; a release file the bucket
  holds is skipped), which sends that release alone, and nothing when it is missing or fails a check. Never upload the
  folder whole: a phone's is also where `pack-update` writes by default.
  A phone reads only `<url>/<platform>/<channel>/<nativeApi>.json`, so each store generation on a channel takes its
  own fixes.
  `akan pack-update` writes an unsigned phone bundle for whoever holds the key to sign and records it in
  `<out>/pack.json`, exiting 2 when `--against` says it needs a new store build; `akan push-update` packs and uploads to
  the Akan Cloud project that holds the key, and `akan register-binary` registers a store build after `release-*`. A
  release that hangs is rolled back while the app runs, and `report: { url }` has a phone post what became of each
  release (applied, confirmed, rolled back and why) at its next launch, so rollback rates are visible. `devtools: true`
  opens the web inspector of a release build for an internal test target. The channel is the backend env the binary was built for unless `channel` names one;
  on a desktop, `updates.setChannel({ channel })` moves the installed app to another manifest until set back with
  `null` — a server putting a device on a pilot channel — and never to a release older than the one running. A
  release that does not come up is rolled back to the one before.
- **An unattended screen** — signage, a kiosk — takes `desktop.recovery: "reload"` (a crashed page loads again,
  and the app relaunches when the webview ends), `desktop.window: { fullscreen, skipTaskbar, frameless }`,
  `desktop.screenCapture: "auto"` (Windows answers `getDisplayMedia()` with the first screen, no picker) and
  `android.autoplay` (media plays with sound without a tap). Its carried server takes `desktop.server: { restart:
  "forever", watchdog: true }` — restarted after every crash, never given up on, and killed and restarted when its
  health route stops answering (every 10 s, 3 misses; `{ intervalMs, failures }` to tune) — and
  `desktop.webview2: "standalone"` puts the whole WebView2 Runtime (~200 MB) in the Windows setup for a PC offline at
  install. `desktop.server.env` adds variables to the server's start; the build refuses a secret-named one and those
  the stage owns. The `window` plugin places it: `placeOnDisplay({ index, bounds, unit: "physical" })` puts a window
  on one display in that display's device pixels — a 640×128 LED panel — lowering the minimum size to fit, beside
  `setAlwaysOnTop`, `setCursorVisible` (which hides the pointer over its external views too, on Windows) and
  `setDecorations`. `native.backgroundColor` (or `{ light, dark }`) is what a window and an external view show before
  their page paints, so a dark board never flashes white, and `desktop.publisher` names who publishes a Windows app in
  Apps & features and its executable's company (the app name when unset, never Bun's own).
- **A third-party page shown first-party** — a scoreboard, a menu board — is the `external-view` plugin, listed in
  `native.plugins`: a webview over the window with a browser profile of its own, its top level held to the origins it
  was opened for while its frames load web content from anywhere, with an init script that runs in the top document
  only, `evaluate`, a trusted `sendKey`, `capture`, and `loadFailed` / `gone` (it reloads, or is rebuilt, by itself;
  the reason is `terminated` on macOS, and `rebuildFailed` when a rebuild failed and the view is closed, to be opened
  again) / `consoleMessage` events. Every method on Windows and Linux, where a visible view also holds the keyboard
  focus and no `consoleMessage` is sent; macOS 14+ lacks `sendKey`, `setMuted` and `capture`. A view opens only the
  exact origins `native.desktop.externalView.allowOrigins` lists (none without it), over the calling page's own window:
  its own `allowOrigins` narrow within them, and opening it again while it is open never adds one. Closed, its id opens
  again for any listed origins with the same profile, which belongs to the id. `evaluate` and `initScript` need
  `desktop.externalView.evaluate: true`, `sendKey` needs `desktop.externalView.sendKey: true`.
