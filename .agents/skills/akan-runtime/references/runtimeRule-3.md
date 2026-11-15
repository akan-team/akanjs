<!-- akan:generated -->

## A Desktop App's Server — `bin` And `trustedDependencies`

A desktop app whose `native` section, or target, declares `desktop: { server: true }` carries the app's server:
`akan build-desktop`, `start-desktop --release` and `publish-update` put the backend `akan build` made into the
app — everything the backend build wrote (the `.js`, `akan.build.json`, `private/`, a bundled package's `.node`,
`.wasm` or file asset) but the Dockerfile and its `akan.env.json`, the RSC worker, the console, `csr/` and
`public/` — and install its packages first with `bun install --production --prefer-offline`, before `akan build`
runs. `start-desktop` without `--release` starts `akan start` beside the app when no dev server of this checkout
answers. The setting is the app's backend, so it does not change under an installed app: an update whose release
carries a server when the app has none, or none when it has one, is refused, and switching means a reinstall.
`desktop: { server: { omit: ["rclnodejs"] } }` carries the server without packages only the image needs — an addon
tied to the image's system, code only a process the app never starts loads — and whatever only they pull in; the
image keeps them, and the server's own bundle must not import them. A package another dependency still installs
stops the build, naming who needs it. So does a native addon that would not load on a user's computer: no binary
for the app's OS and CPU, a link outside the system, or a `binding.gyp` its install never compiled. It runs as an API-only edge server in database mode `single` (SQLite), on a loopback port the launcher picks — the last session's when
it is free, which is not a guarantee, so a provider that needs an exact redirect URI signs in through a cloud
server's adapter. It refuses a `Host` other than its own, but any program on the computer can still call that port:
guard its endpoints as a network server's. It runs in one process, so a `main.ts` or an env asking for replicas (`replica`,
`solo: false`, `AKAN_SOLO=false`, `AKAN_REPLICA`, `AKAN_COMMAND_TYPE=start`) does not boot in the app. Its data lives in the app's local data folder (`%LOCALAPPDATA%\<id>\server`
on Windows, never Roaming; `server-debug` for a `--debug` build). It trusts the OS certificate store, and of the
user's environment it takes a fixed set and nothing else: the system's own (`PATH`, `HOME`, the temp folder, `LANG`,
`TZ`, Windows' folders and `ComSpec`), the desktop session a `bin` tool needs for the screen or the audio server
(`DISPLAY`, `XAUTHORITY`, `WAYLAND_DISPLAY`, the session bus, `PULSE_*`, `XDG_*`), and the proxy and CA variables
(`HTTP(S)_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`).

**Everything it carries is on the user's computer, readable.** That is `private/` as it is — each lib's too, under
`private/libs/<lib>` — and the server env of the one environment the build is for (`--env`: `debug` for
`build-desktop`, `local` for `start-desktop --release`, `main` for `publish-update`, unless named): the build keeps
`env/env.server.<env>.ts` and swaps every other environment's file for exports that refuse to be read. The server env
each lib exports as its defaults (the lib's `env.server.testing.ts`, spread into every environment by
`env.server.type.ts`) ships as well. Keep a key in those files only if every user of the app may hold it; a secret the
server needs belongs to a cloud server its adapter calls. There is no `public/`: a file the server reads at runtime
goes in `private/` and is read from `AKAN_APP_DIR` (the folder `server.js` sits in), never from `process.cwd()`, which
is the app's data folder.

**Nothing from `docker` reaches it.** `preRuns`, `postRuns` and a whole Dockerfile install into a Linux image the
desktop app never runs in, and the build warns when an app has them and carries no `bin`. What the server needs
from them comes one of two ways:

```ts
const config: AppConfig = {
  trustedDependencies: ["rclnodejs"],
  bin: {
    ffmpeg: {
      "darwin-arm64": {
        url: "https://files.example.com/ffmpeg-7.1-lgpl-darwin-arm64.zip",
        sha256: "…",
        file: "ffmpeg-7.1/bin/ffmpeg",
      },
      "win32-x64": { url: "https://files.example.com/ffmpeg-7.1-lgpl-win64.zip", sha256: "…", file: "bin/ffmpeg.exe" },
      "linux-x64": { path: "tools/linux-x64/ffmpeg" },
    },
  },
};
```

- **An executable the desktop app spawns goes in `bin`** — its server's code or its native plugins, whether or not
  it carries a server — keyed by the name the code spawns and then by
  `${process.platform}-${process.arch}` (`darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64`, `win32-arm64`,
  `win32-x64`) — Node's names, unlike an update feed's folder, which is `<os>-<arch>` with the OS spelled `macos`,
  `windows` or `linux` (`windows-x64/<channel>.json`). A source is `{ url, sha256, file? }` — downloaded when the app is built, refused unless it hashes
  to `sha256` (so plain http is as safe as https), kept in `apps/<app>/.akan/cache/bin/<sha256>` — or
  `{ path, file? }`, relative to the `akan.config.ts` that declares it. `file` is the executable inside an archive
  (`.zip`, `.tar.gz`, `.tgz`, `.tar.xz`, `.tar.bz2`, `.tar`), unpacked with the OS's own `tar` (`unzip` for a zip
  on Linux).
- Only the building computer's platform is fetched, and an entry without it fails the build instead of the user's
  call. `build-desktop` and `start-desktop` copy the file into the app's `bin/` (keeping `.exe` on Windows), sign it
  with the app on macOS, and put that folder first on the app's PATH. The server's `spawn("ffmpeg")` needs no change
  and finds the carried file even in an app launched from the Finder, whose PATH is only
  `/usr/bin:/bin:/usr/sbin:/sbin`. A native plugin finds the folder in `ctx.binDir`: Bun's own `spawn` and `which`
  without `env` read the environment the app started with, so a plugin passes `env: process.env` to run one by name.
  The server passes it too when it spawns a carried `bun build --compile` executable: the shell starts the server as
  Bun with `BUN_BE_BUN=1`, which akanjs takes out of `process.env` at boot, and a child spawned without `env` still
  inherits it and runs as Bun's own CLI instead of the tool.
- **One file per entry, so carry a static build.** A build that loads its own shared libraries — a `-shared`
  archive, or Homebrew's ffmpeg with its 55 dylibs — runs on the computer that built it and nowhere else.
- **A lib's `bin` reaches only the apps that depend on it**, unlike its `docker` steps; the app's own entry of the
  same name wins, and two libs that declare one name differently fail the build.
- **The image does not read `bin`.** Keep installing through `docker.preRuns` there.
- **A package that builds itself at install goes in `trustedDependencies`.** `bun install --production` runs no
  dependency's install or postinstall script unless the package is trusted, so an addon with no prebuild arrives
  unbuilt and fails at its first call. The list lands in the built `package.json`, so it applies to the image and to
  the desktop server alike, and a lib's list reaches every app, like its `externalLibs`.

**Carry an LGPL ffmpeg.** A build configured with `--enable-nonfree` may not be redistributed at all — the macOS
binary npm's `ffmpeg-static` downloads is one — and a `--enable-gpl` build obliges you to offer its source. An LGPL
build has no `libx264`, so encode H.264 through the OS's encoder: `h264_videotoolbox` on macOS, `h264_mf` on
Windows, VAAPI or NVENC on Linux. Codec patents are a separate question to settle before shipping.

**A server bound to its machine stays a service.** A server that needs a whole environment — ROS, system services,
root to change the network or the clock — runs as a service on that machine (the image), and the desktop app's
target leaves `desktop.server` off, pinned to it with `AKAN_PUBLIC_SERVER_URL` at build time. A carried server runs
as the signed-in user and stops with the app, and so does what it started. On macOS and Linux the server leads its
own process group: quitting the app ends the group, and when the app was killed or crashed — even while the server
was still starting — the server sees its parent gone and ends the group itself, SIGTERM first and SIGKILL a second
later for whatever ignored it. On Windows the job object ends them all with the app. A process started `detached`
leaves the group, or the job, and keeps running.

**An edge server carries no cloud secret.** The carried server runs `operationMode` edge, and the same app's cloud
deployment runs cloud: a module whose `serve(ref, { operationMode: ["edge"] }, …)` lists the modes it belongs to mounts
in those alone, and `modules: ["@edge"]` (or `AKAN_MODULES=@edge`) names every module that lists edge, with what they
inject, cascade to and hold a relation to. `desktop: { server: { profile: "edge", modules: ["@edge"] } }` builds the
carried server that way: `env/env.server.<env>.edge.ts` is bundled in place of `env/env.server.<env>.ts`, which never
enters it, and the build evaluates the profile file with no app env and refuses one whose secret-named keys hold a
value — a `process.env.X ?? "literal"` counts as the literal. Signing, encryption, master and session keys, `pwd`, a
`…dsn` and a connection string are secret-named, and a URL holding a password or a secret-named query parameter is a
secret under any key. The profile may spread `libEnv`, and the lib defaults it reaches are checked as the bundle
carries them; a profile that imports the file it replaces is refused. Each lib's env defaults (`env.server.testing.ts`) are
swapped the same way: for the lib's `env/env.server.testing.edge.ts`, held to the same check, or for the defaults with
every secret-named value left out, which the build names in a warning — and a default a JSON snapshot cannot carry (a
function, Map, Set, Date, class instance, bigint or non-finite number) is refused unless the lib has its profile file.
`akan build <app> --profile edge` does the same for an image. A module listing only edge does not mount under `akan start` (local): list `local` too to develop
it there.

**A file the user picks reaches the server as a grant, never as a copy or a path.** With `"file-picker"` in
`native.plugins`, `filePicker.pickFiles({ forServer: true })` (also `pickDirectory` and `saveFile`,
from `akanjs/client/native`) copies nothing, whatever the size: its FileRefs serve the originals for a preview, and
each result carries a `grant`. The page hands the grant to an endpoint, and the server exchanges it:

```ts
const input = await NativeFile.resolve(grant, "read"); // "write" for a saveFile grant, "folder" for pickDirectory
const clip = await NativeFile.resolveIn(folderGrant, "day1/a.mp4"); // refused if it climbs out of the folder
```

The carried server asks the shell that showed the dialog over its IPC channel, so it reaches what the user picked
and nothing else, and no page ever holds a path. Behind a dev build `akan start` checks the grant's signature
against a key in `~/.akan/native` instead, in `operationMode` local only; every other server refuses a grant.

**A secret the user gives the server is kept by the OS, never in a file.** `NativeSecret.set(key, value)`,
`get(key)` (null when none is kept) and `remove(key)` from `akanjs/server` reach the OS credential store through the
shell that carries the server — the macOS Keychain, the Windows Credential Manager, the Secret Service on Linux — in a
store of the server's own, apart from the page's `secretStorage`, so no page script reads it. Anywhere but a carried
server `NativeSecret.available` is false and every call rejects: keep secrets in the env there. On macOS without a
Team ID signature, any program of the same user can read the store's key through `security`, as with
`secretStorage`.

**Devices belong to the shell, not the server.** Displays and their changes (`screen`), windows placed on them
(`window`), the system volume and mute (`volume`), global shortcuts (`global-shortcut`), keep-awake (`keep-awake`)
and launch at login (`autostart`) are native runtime plugins, each added to `native.plugins`. Every builtin plugin's
page API is
`akanjs/client/native/<id>` (`akanjs/client/native/window`, `…/screen`, `…/global-shortcut`), imported in a `webkit/`
hook; `volume` and `filePicker` also come from `akanjs/client/native` itself. A capability the shell
lacks is added there: an app's own plugin runs as Bun code in the plugin host and cannot add a native shell op.
`isNativeApp()`, `isNativeShell()`, `nativePlatform()` and `desktopPlatform()` come from `akanjs/client`, which starts
the native runtime only inside a shell. A static import of `akanjs/client/native` loads `@akanjs/native/core` on every
web page that reaches the file, so an app's store, or its own hook a web page also renders, loads the plugin on first
use behind the check: `if (isNativeApp()) await (await import("akanjs/client/native/push")).push.register()`.

**A plugin the app or lib owns lives in `native/<id>/`**, the folder named after the plugin id: `native-plugin.json`
beside its page API (`src/index.ts`, `definePlugin` from `akanjs/client/native`), its desktop part (`src/desktop.ts`,
`defineDesktopPlugin` from `akanjs/native/desktop`), Kotlin and Swift. Every mobile and desktop target ships it; a
lib's reach only the apps that depend on it, and the app's own wins an id. Its page API is imported by a `webkit/`
hook (`../native/<id>/src`) and nothing else; pages and components call the hook, the same way they reach
`akanjs/client/native`. A plugin throws `AkanNativeError`, the error its bridge carries back to the page, which is
why `no-throw-raw-error` exempts a root `native/` folder.

**A page's storage and browser APIs follow the shell, not the browser.** A native shell serves the page from
`app://localhost` on iOS, macOS and Linux, which keeps no cookies: `document.cookie` reads `""` and a write is
dropped, so the value exists in the browser and vanishes in the app. Web Storage does work in the shells, but it
bypasses the store akanjs picks per platform (the shell's Preferences in an app) and throws during SSR. So app and lib
code never touches `document.cookie`, `localStorage` or `sessionStorage` (`no-document-cookie`, `no-web-storage`): it
uses `getCookie` / `setCookie` / `removeCookie`, `storage`, and `secretStorage` for tokens and credentials, all from
`akanjs/client`. `setCookie` writes `path=/; SameSite=Lax; Secure`, and an options object overrides only the keys it
names — pass `sameSite: "none"` only for a cookie a cross-site POST must carry back. `getCookie` reads a name sent
twice as unset, since a sibling subdomain can plant a second copy; server code reads `cookieJar()` from
`akanjs/fetch`, or `CookieJar.parse(req.headers.get("cookie"))`, never `req.cookies`. Browser APIs an app WebView lacks
stay in a `webkit/` hook that branches on `isNativeApp()` from `akanjs/client`, which is where the app side goes
too (`no-web-only-api-outside-webkit`, a warning): `navigator.share` / `canShare` (Android's WebView has none),
`navigator.serviceWorker` and `Notification.requestPermission` / `.permission` (no app page has them),
`navigator.geolocation` (use `useGeoLocation` from `akanjs/webkit`) and `navigator.vibrate` (iOS has none; use
`haptics`). They are legal on the web, so the rule does not ban them; a root `native/` folder is out of its scope,
since a plugin's web part is where those APIs belong.

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
  `POSTGRES_INSIGHT_URL`. `REDIS_URI` is required outside local development. Pool size, SSL and
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
| `bun main.js ops snapshot [--id] [--out] [--include-solid] [--allow-plaintext] [--json]` | `VACUUM INTO` a consistent copy, `integrity_check`, sha256, gzip, age encryption, `manifest.json` |
| `bun main.js ops restore <manifest.json> [--identity <file>] [--allow-plaintext]` | offline only: verify, stage, keep the old file as `<db>.pre-restore-<ts>` (its `-wal`/`-shm` beside it), swap |
| `GET /_akan/ops/info` | the public info plus `akanVersion`, `buildId`, `serverMode`, `databaseMode`, `solo`, `startedAt`, `replicaIdx` |
| `POST /_akan/ops/snapshot` `{ id, includeSolid?, uploadUrls: { main, solid?, manifest } }` | 202; a child process snapshots, then PUTs each file and the manifest **last** |
| `GET /_akan/ops/snapshot/:id` | `running` → `uploading` → `done` \| `failed`; kept in memory, so a restart answers 404 |
| `POST /_akan/ops/migrate` `{ id, action, target?, params?, expect?, items? }` | 202; a child runs `ops migrate <action> … --json` for the token's `sub` |
| `GET /_akan/ops/migrate/:id` | `running` → `done` (`exitCode`, and `result`: the line `--json` printed last) \| `failed` (it printed none) |

- **The entry is the image's own `main.js`** — a production image carries no `akan` CLI. `AkanApp.start()` hands
  `argv[2] === "ops"` to the command before it boots anything. It reads the container's env — the `AKAN_PUBLIC_*`
  identity and the database paths — so run it with that env (`docker compose exec`), never a bare shell's.
- **Restore refuses while an app answers `/_akan/app/health` on `PORT`** and names it by its `/_akan/app/info`;
  `--force` is for a port some other app holds.
- **The channel exists only when `AKAN_OPS_PUBLIC_KEY` is set** (Ed25519: PEM, JWK, base64 SPKI or raw 32 bytes).
  The control plane signs a short EdDSA JWS — `typ` `akan-ops+jwt` (`JWT` or none from an older control plane; any
  other `typ` is refused), `aud`, `iat`, `exp` at most 300s after `iat`, a `jti` the process refuses twice, and
  optionally `sub`, whom it acts for — and the host holds only the public half, so a machine someone carries off
  mints nothing.
  `aud` is `<appName>/<environment>`, or `<appName>/<environment>/<AKAN_OPS_INSTANCE>` when that is set, and then
  only that: a token minted for the app as a whole would replay across every host sharing the name. Verified calls
  get 30 a minute per process; every refusal is the same 401 and spends none of them, and an address refused 10
  times in a minute gets 429 until it passes. A malformed key, or the machine token's own key
  (`AKAN_MACHINE_PUBLIC_KEY`), logs an error and leaves the app serving with the channel off.
- **A migrate job runs for the token's `sub`**, which the run records as its actor: apply, rollback and prune-indexes
  refuse a token without one, and a body naming `actor` is refused. Each option reaches the command as
  `--name=value`. One job runs at a time per process (409 meanwhile); the run's own lease keeps two hosts on one
  database apart. Jobs live in memory, so after a restart read the outcome from `list`. Polls count toward the 30 a
  minute.
- **The app holds no storage credential.** It PUTs to the presigned URLs it was handed (`application/octet-stream`,
  the manifest `application/json`), plain http only to loopback. The manifest landing is the commit marker.
- **Snapshots cover the SQLite modes only.** `single` copies the main file and, with `includeSolid`, the Solid file;
  `multiple` copies the main file; `cluster` is refused. Paths follow the adaptors' env precedence
  (`SQLITE_DATABASE_PATH`, `AKAN_SOLID_DB_PATH`, `AKAN_SQLITE_DIR`); a solo process uses the path its adaptor
  actually opened, so a gateway deployment that moved the file in `env.server.ts` names it in the env too.
- **`AKAN_BACKUP_RECIPIENT=age1…[,age1…]` encrypts before upload** — age v1 X25519, so `age -d -i key.txt` opens
  it. Outside local operation a snapshot refuses to run without it, the ops channel's job included, unless
  `--allow-plaintext` or `AKAN_BACKUP_PLAINTEXT=1` allows an unencrypted one. Restore takes `--identity` /
  `AKAN_BACKUP_IDENTITY_FILE`, or a file an operator already decrypted with `age -d -o <name without .age>`; given
  an identity, it refuses a manifest recording no encryption without `--allow-plaintext`.
- **The host keeps the newest `AKAN_OPS_SNAPSHOT_KEEP` (default 2) snapshots** under `AKAN_OPS_SNAPSHOT_DIR`
  (default `<db dir>/snapshots/<id>/`) — the copy an edge still has while its uplink or the bucket is down. Files are
  0600 and each `<id>/` 0700; `AKAN_OPS_SNAPSHOT_FILE_MODE` (octal, e.g. `640`) sets another mode.
- **`buildId` is `AKAN_BUILD_ID` when the deployment sets it**, else the git sha `akan build` wrote into
  `akan.build.json` beside `main.js` (`-dirty` when the tree was).
- **`operationMode` does not gate any of this** — the key does. `edge` means a production host outside the
  cluster: the console refuses it like `cloud`, `/mcp` starts off unless `AKAN_MCP=true` or `setMcp(true)`, and
  `operationMode: ["edge"]` on a `serve()` (the whole module, endpoints included) or an `init` / `interval` / `cron`
  runs it only there; `local` is a developer machine.

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
