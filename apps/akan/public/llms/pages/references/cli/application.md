# Application

- Source: /references/cli/application
- Mirror: /llms/pages/references/cli/application.md
- Section: references
- Category: CLI Reference
- Priority: P0

## Headings

- Application CLI (#application-cli)
- Rules Every Command Shares (#application-rules)
- Short Names (#application-short-names)

## Content

Application

Backend environment the app connects to.

Application CLI

These commands carry an app from creation to release: create it, run it locally, check and build it, then ship it as a native app.

- Manage Apps

  - create-application: Create a new app under `apps/` from the template.

  - remove-application: Delete an app's folder from the workspace.

  - sync: Regenerate the generated files of an app or library.

  - plan-slice: List the files an app needs to move into a workspace of its own.

- Local Development

  - start: Run the dev server for one or more apps.

  - dbup: Start the local database containers.

  - dbdown: Stop the local database containers.

  - db-export, db-import: Copy an app's data out of one database mode and into another.

  - script: Run a file from the app's `script/` folder.

  - console: Open an interactive server console.

  - logs: Follow a running app's logs, filtered.

- Check and Build

  - typecheck: Typecheck an app or a library, its tests included.

  - test: Run the tests of an app, library or package.

  - build: Build the app for production into `dist/apps/<app>`.

- Native

  - start-ios, start-android: Run the app on a simulator, an emulator or a connected device.

  - start-desktop: Run the app as a desktop app on this computer.

  - build-ios, build-android, build-desktop: Build the native app on the native runtime.

  - release-ios, release-android: Build the app for an App Store or Play Store release.

  - update-keygen, publish-update, pack-update, push-update, register-binary: Sign and publish releases installed apps update themselves to, or pack a phone update for a signer elsewhere.

Command

`akan create-application <appName> [--start <boolean>]`

Create `apps/<appName>` from the app template, then sync it. With `--start` it also boots the dev server.

- appName (String, required): App name. It is lowercased, and spaces become hyphens.

- --start (Boolean, default false): Start the dev server and open the browser once the app is created.

`akan remove-application <app>`

Delete the `apps/<app>` folder, so the app drops out of sync, builds and deployment. Commit first if you may want it back.

`akan sync <app|lib>`

Rescan an app or library and rewrite its generated files. Run it after adding, renaming or deleting a file, or after changing its imports.

- generated files: Barrels like `index.ts`, `cnst.ts` and `st.ts`, `akan.<app|lib>.json`, and the scoped `AGENTS.md`.

- dependencies: Each package the code imports is written into its own `package.json`, at the root's version.

- apps only: Also links lib assets into `public/libs` and, with `syncPageLibs`, lib routes into `page/(libs)`.

- run for you: `start`, `build`, `typecheck` and `test` run it first through `--write`.

`akan plan-slice <app> [--format <text|json>]`

Print the exact files an app needs to live in a workspace of its own. It only prints the plan and writes nothing.

- --format (String, default text, text | json): Output format.

- contents: The app, every lib it reaches, the workspace shell around them, and a root `package.json`.

- file source: Files come from git, so gitignored files such as env values are left out.

- root manifest: Keeps only the packages the slice imports, at the workspace's own version specs.

- warnings: Untracked files under the app or its libs are listed, because git would not carry them.

`akan start [apps...] [--plain <boolean>] [--kill <boolean>] [--concurrency <number>] [--dbup <boolean>] [--open <boolean>] [--share <boolean>] [--write <boolean>]`

Run the dev server, SSR frontend and backend together. Name apps space- or comma-separated, pass `all`, or leave them out to tick them in a checklist. Several apps share one session.

- --plain (Boolean, default false): Print prefixed, interleaved lines instead of the full-screen view.

- --kill (Boolean, default false): Free the dev ports first. A holder that is not an akan process is reported and left alone.

- --concurrency (Number): Apps booted at a time. Unset: the lower of half the memory ÷ 1.8GB and cores ÷ 4.

- --dbup (Boolean, default true): Start the local services of the mode each app runs in first. On exit it stops only what it started.

- --open (Boolean, default false): Open the app in the browser.

- --share (Boolean, default false): Also publish each app on a public URL through an akan tunnel. `s` in the view copies it.

- --write (Boolean, default true): Run `akan sync` first so generated files are current.

- alias: `akan s` runs this command.

- plain output: A pipe, a redirect or a terminal with no size switches to `--plain` on its own.

- session log: Each app writes `local/apps/<app>/runtime/dev.log`, except one app under `--plain`.

- memory budget: `AKAN_MEMORY_LIMIT` lowers the memory `--concurrency` is derived from.

`akan dbup [--mode <mode>]`

Start the local database services with Docker Compose: Redis for `multiple`, Redis and Postgres 18 for `cluster`. `akan start` already runs it unless `--dbup false`.

- --mode (String, single | multiple | cluster): Start one mode's services; `single` needs none. Left out, every mode the workspace's apps declare.

- Docker: Needs a running Docker daemon. Services already running are left as they are.

- compose file: `local/docker-compose.yaml` is written on first use and then left to you.

- missing service: An older compose file may lack one. Add it, or move the file aside to get the current template.

`akan dbdown`

Stop the local database with `docker compose down` in `local/`. Every service of that compose project stops, whichever app started it.

`akan db-export <app> [--dir <dir>]`

Write every model table of the app to one NDJSON file each, from the database of the mode the shell names. Pair it with `db-import` to move data between modes, such as `single` to `cluster`.

- --dir (String, default local/transfer): Folder to write the files into, relative to the workspace root.

- mode: The shell's `AKAN_DATABASE_MODE`, or the app's first declared mode.

- deployed data: For a deployed `single` app, copy its SQLite file and point `SQLITE_DATABASE_PATH` at the copy.

- no traffic: Boots the app without listening and without running cron or init jobs.

`akan db-import <app> [--dir <dir>]`

Read the files `db-export` wrote into the database of the mode the shell names. The app must declare that mode.

- --dir (String, default local/transfer): Folder to read the files from, relative to the workspace root.

- rows: Rows move as stored, removed ones included. An existing id is replaced, so a rerun is safe.

- text search: The search index is rebuilt after the import.

- not moved: Sessions and queued jobs stay behind, so users sign in again. Copy uploads in `local/` yourself.

- no traffic: Boots the app without listening and without running cron or init jobs.

`akan script <app> [filename]`

Sync the app, then run `apps/<app>/script/<filename>.ts` with Bun. Leave the filename out to pick one from a list.

- filename (String): A file directly in `script/`; the `.ts` suffix is optional. Subfolder paths are refused.

`akan console <app>`

Open an interactive console for inspecting the app's services and data at runtime. `akan build` also writes `console.js` beside `main.js`, so the same console runs inside a container.

- process: Boots a separate server with no traffic and no internal jobs; it never attaches to `main.js`.

- globals: `srv`, `sig`, `db`, `cnst`, `dict` and `option` are ready at the prompt.

- container: Run `AKAN_CONSOLE=1 bun console.js` inside a built container or pod.

- production: Refused under `main` env, `cloud`/`edge` mode or `NODE_ENV=production` unless `AKAN_CONSOLE=1`.

`akan logs <app> [--level <level>] [--grep <text>] [--endpoint <glob>] [--trace <traceId>] [--child <idx>] [--role <role>] [--origin <origin>] [--since <since>] [--replay <n>] [--json <boolean>] [--follow <boolean>] [--runtime-dir <dir>]`

Follow a running app's logs through its `akan-control.sock`. Every record carries the traceId, endpoint and origin of its call, so you filter by call rather than by text alone.

- --level (String, trace | verbose | debug | info | warn | error): Lowest level to print.

- --grep (String): Text the message must contain.

- --endpoint (String): Endpoint globs, comma-separated: `mutation:*`, `query:userList`.

- --trace (String): One request's traceId; collects every line that request wrote.

- --child (String): Replica indexes, comma-separated.

- --role (String, -R): Process roles: `gateway`, `federation`, `batch`, `all`, `rsc-worker`.

- --origin (String): Call origins: `http`, `websocket`, `mcp`, `internal`, `page`.

- --since (String): Only newer records: `30s`, `5m`, `2h`, `1d`, or epoch ms.

- --replay (Number, default 0, -n): Buffered records to print before following. With `--follow false` it caps the history.

- --json (Boolean, default false): Print NDJSON records instead of rendered lines.

- --follow (Boolean, default true): Keep streaming. `--follow false` prints the history and exits.

- --runtime-dir (String, default local/apps/<app>/runtime, -d): Folder holding `akan-control.sock`. Without it, `AKAN_RUNTIME_DIR` and then the default apply.

- in the console: `akan console` has the same filters as `.tail` and `.trace <id>`.

`akan typecheck <app|lib> [--write <boolean>] [--clean <boolean>] [--incremental <boolean>] [--tests <boolean>]`

Typecheck an app or a library with TypeScript, its own `*.test.ts` and `*.spec.ts` included. A library is checked from its `server.ts`, `client.ts`, `index.ts` and pages, and a bare `akan typecheck` in a workspace with one app checks that app. It reuses an incremental cache, which `--clean` clears first.

- --write (Boolean, default true): Sync the app or library first so generated files are current. `--write false` writes nothing, for a library too.

- --clean (Boolean, default false): Delete this check's incremental cache, under `.akan/typecheck`, before checking.

- --incremental (Boolean, default true): Reuse the TypeScript incremental cache.

- --tests (Boolean, default true): Check the target's `*.test.ts` and `*.spec.ts` too, which nothing imports and Bun runs unchecked. `--tests false` leaves them out, as a build's typecheck does.

- alias: `akan t` runs this command.

`akan test <app|lib|pkg> [--write <boolean>]`

Prepare an app, library or package, then run its tests with `bun test --isolate` in that folder.

- --write (Boolean, default true): Sync an app target first. Libraries and packages are always prepared.

`akan build <app> [--write <boolean>] [--fast <boolean>] [--quiet <boolean>] [--profile <profile>]`

Build the app for production into `dist/apps/<app>`. It typechecks, then compiles the backend, the SSR routes and the CSR bundle.

- --write (Boolean, default true): Run `akan sync` first so generated files are current.

- --fast (Boolean, default false): Skip the typecheck step.

- --quiet (Boolean, default false): Hide the progress output and the build summary.

- --profile (String): A server env profile: the build bundles `env/env.server.<env>.<profile>.ts` in place of the environment's own file, and each lib's `env.server.testing.<profile>.ts` in place of its defaults. The app's profile file must exist, and a profile file whose secret-named key holds a value stops the build.

- alias: `akan b` runs this command.

- lib defaults: With `--profile`, a lib that has no profile file of its own ships its defaults with every secret-named value left out, and the build names what it left out.

- web surfaces: The SSR and CSR steps follow `web` in `akan.config.ts`; a surface turned off is skipped.

`akan start-ios <app> [--target <target>] [--env <env>] [--release <boolean>] [--device <device>] [--team <team>] [--write <boolean>]`

Run the iOS app on a simulator or a paired iPhone. By default it is a debug build whose pages come from your local dev server; `--release` runs a release build of its own bundle instead.

- --target (String): A key of `native.targets` in `akan.config.ts`, or `all`. Asked for when there are several.

- --env (String, default local, local | debug | develop | main): Backend environment the app connects to.

- --release (Boolean, default false): Run a release build that carries its own production web build instead of loading the dev server.

- --device (String): The simulator, emulator or device to run on: its id or name, such as `iPhone 17` or `Pixel_10`. A paired iPhone's name makes a signed iPhone build. Left out, a booted iPhone simulator (else the newest one) or a connected Android device (else the first emulator, started) is used.

- --team (String, -T): The Apple team id the signing is narrowed to, when the Mac holds profiles of several teams.

- --write (Boolean, default true): Run `akan sync` first so generated files are current.

- alias: `akan si` runs this command.

- dev server: Without `--release` the app loads its pages from `akan start <app>` through the dev gateway, so every save shows up; keep the dev server running, or the command stops and says so.

- one target: Runs one native target at a time; with several, pass `--target <name>`.

- output: A dev build goes under `dist/native/<app>/<target>/dev/ios`; a `--release` run under `…/build/ios`.

`akan start-android <app> [--target <target>] [--env <env>] [--release <boolean>] [--device <device>] [--write <boolean>]`

Run the Android app on an emulator or a connected device. It works like `start-ios`: the dev server by default, a bundled release build with `--release`.

- --target (String): A key of `native.targets` in `akan.config.ts`, or `all`. Asked for when there are several.

- --env (String, default local, local | debug | develop | main): Backend environment the app connects to.

- --release (Boolean, default false): Run a release build that carries its own production web build instead of loading the dev server.

- --device (String): The simulator, emulator or device to run on: its id or name, such as `iPhone 17` or `Pixel_10`. A paired iPhone's name makes a signed iPhone build. Left out, a booted iPhone simulator (else the newest one) or a connected Android device (else the first emulator, started) is used.

- --write (Boolean, default true): Run `akan sync` first so generated files are current.

- alias: `akan sa` runs this command.

- dev server: Without `--release` the app loads its pages from `akan start <app>` through the dev gateway, so every save shows up; keep the dev server running, or the command stops and says so.

- one target: Runs one native target at a time; with several, pass `--target <name>`.

- output: A dev build goes under `dist/native/<app>/<target>/dev/android`; a `--release` run under `…/build/android`.

`akan start-desktop <app> [--target <target>] [--env <env>] [--release <boolean>] [--write <boolean>]`

Run a native target as a desktop app on this computer: macOS, Windows or Linux, whichever it is, since a desktop app builds only on its own OS. It works like `start-ios`, with no device or team to pick.

- --target (String): A key of `native.targets` in `akan.config.ts`, or `all`. Asked for when there are several.

- --env (String, default local, local | debug | develop | main): Backend environment the app connects to.

- --release (Boolean, default false): Run a release build that carries its own production web build instead of loading the dev server.

- --write (Boolean, default true): Run `akan sync` first so generated files are current.

- alias: `akan sd` runs this command.

- dev server: Without `--release` the app loads its pages from `akan start <app>` through the dev gateway, so every save shows up; keep the dev server running, or the command stops and says so.

- a server without --release: For a target that carries its server, a dev server already answering on the app's dev port is used as it is. Otherwise `akan start <app>` runs in the same command, the app opens once it serves, and Ctrl+C or closing the app stops both. `--env` does not reach the dev server, which follows the workspace `.env`.

- desktop.server: With `native: { desktop: { server: true } }` in `akan.config.ts`, or `desktop.server` in one target, the desktop app carries the app's server: it starts beside the window on a loopback port and the pages call nothing else. `build-desktop`, `start-desktop --release` and `publish-update` all read it. An installed app refuses an update that adds or drops the server, so turning it on or off for an app already out there takes a reinstall.

- carried server: An API-only server on the app's own Bun, bound to 127.0.0.1. Any program on the computer can call it, so guard its endpoints as a network server's. The app needs `single` in `database.modes`, and the data stays in the app data folder's `server/`. It carries `private/` (each lib's too), the `--env`'s `env.server.<env>.ts` and the libs' server env defaults in plain text, so keep secrets and license files out of them. It has no `public/` and runs in its data folder: read runtime files from `AKAN_APP_DIR`, never `process.cwd()`. It runs none of the image's `docker` steps; a package that builds itself at install goes in `trustedDependencies`.

- bin: An executable `bin` names in `akan.config.ts` is fetched for this computer and carried in every desktop app, whether or not it carries a server: it is first on the app's PATH, so the carried server's `spawn("ffmpeg")` runs it, and a native plugin finds it in `ctx.binDir`.

- one target: Runs one native target at a time; with several, pass `--target <name>`.

- output: A dev build goes under `dist/native/<app>/<target>/dev/<macos|windows|linux>`; a `--release` run under `…/build/<macos|windows|linux>`.

`akan build-ios <app> [--target <target>] [--env <env>] [--debug <boolean>] [--write <boolean>]`

Build the iOS app on the native runtime. It first makes a production web build against `--env`, then builds a simulator app for each target.

- --target (String): A key of `native.targets` in `akan.config.ts`, or `all`. Asked for when there are several.

- --env (String, default debug, local | debug | develop | main): Backend environment the app connects to.

- --debug (Boolean, default false): Make a debug build instead of a release one.

- --write (Boolean, default true): Run `akan sync` first so generated files are current.

- alias: `akan bi` runs this command.

- output: Written under `dist/native/<app>/<target>/build/ios`; the command prints each file's path.

`akan build-android <app> [--target <target>] [--env <env>] [--debug <boolean>] [--write <boolean>]`

Build an APK of the Android app on the native runtime. Like `build-ios`, it makes a production web build against `--env` first.

- --target (String): A key of `native.targets` in `akan.config.ts`, or `all`. Asked for when there are several.

- --env (String, default debug, local | debug | develop | main): Backend environment the app connects to.

- --debug (Boolean, default false): Make a debug build instead of a release one.

- --write (Boolean, default true): Run `akan sync` first so generated files are current.

- alias: `akan ba` runs this command.

- signing: Signed with `~/.akan/native/debug.keystore`, which is fine for testing; a Play Store file comes from `release-android`.

- output: Written under `dist/native/<app>/<target>/build/android`; the command prints each file's path.

`akan build-desktop <app> [--target <target>] [--env <env>] [--debug <boolean>] [--installer <boolean>] [--arch <arm64|x64>] [--sign <boolean>] [--notarize <boolean>] [--write <boolean>]`

Build the desktop app on this computer's OS: a `.app` on macOS and an app folder on Windows and Linux. Like `build-ios`, it makes a production web build against `--env` first. A release build is signed only with `--sign`: the environment names which identity, a Developer ID on macOS (`AKAN_NATIVE_MACOS_*`) or an Authenticode certificate on Windows (`AKAN_NATIVE_WINDOWS_*`), and `--notarize` then has Apple notarize the signed macOS app. An unsigned release build warns, since a downloaded copy is blocked or flagged. See the Desktop Release cheatsheet.

- --target (String): A key of `native.targets` in `akan.config.ts`, or `all`. Asked for when there are several.

- --env (String, default debug, local | debug | develop | main): Backend environment the app connects to.

- --debug (Boolean, default false): Make a debug build instead of a release one.

- --installer (Boolean, default false): Also what a person downloads: on Windows `<file>-<version>-<arch>-setup.exe` with NSIS (`winget install NSIS.NSIS`), on macOS a `.dmg`, on Linux an `.AppImage` (needs `mksquashfs`).

- --arch (String, default this computer's): The CPU a Windows or Linux app runs on: `arm64` or `x64`. The server's addons and `bin` follow it. A macOS app is Apple silicon (arm64) only.

- --sign (Boolean, default false): Sign a macOS or Windows release build with the identity `AKAN_NATIVE_MACOS_*` or `AKAN_NATIVE_WINDOWS_*` names. The env alone signs nothing, and `--sign` without an identity stops before the build.

- --notarize (Boolean, default false): macOS: upload the signed app to Apple's notary service and staple the ticket. It takes `--sign` and the notary credentials (`AKAN_NATIVE_MACOS_NOTARY_*`).

- --write (Boolean, default true): Run `akan sync` first so generated files are current.

- alias: `akan bd` runs this command.

- desktop.server: With `native: { desktop: { server: true } }` in `akan.config.ts`, or `desktop.server` in one target, the desktop app carries the app's server: it starts beside the window on a loopback port and the pages call nothing else. `build-desktop`, `start-desktop --release` and `publish-update` all read it. An installed app refuses an update that adds or drops the server, so turning it on or off for an app already out there takes a reinstall.

- carried server: An API-only server on the app's own Bun, bound to 127.0.0.1. Any program on the computer can call it, so guard its endpoints as a network server's. The app needs `single` in `database.modes`, and the data stays in the app data folder's `server/`. It carries `private/` (each lib's too), the `--env`'s `env.server.<env>.ts` and the libs' server env defaults in plain text, so keep secrets and license files out of them. It has no `public/` and runs in its data folder: read runtime files from `AKAN_APP_DIR`, never `process.cwd()`. It runs none of the image's `docker` steps; a package that builds itself at install goes in `trustedDependencies`.

- bin: An executable `bin` names in `akan.config.ts` is fetched for this computer and carried in every desktop app, whether or not it carries a server: it is first on the app's PATH, so the carried server's `spawn("ffmpeg")` runs it, and a native plugin finds it in `ctx.binDir`.

- installer: It installs for the current user under `%LOCALAPPDATA%\Programs`, where updates swap the app without an administrator, and adds the WebView2 Runtime where it is missing. `/S` installs silently and `/RUN` starts the app afterwards.

- reinstall: `/D=<folder>` picks the install folder. Run again without it, the setup installs where the app already is; one started while another runs refuses to start.

- output: Written under `dist/native/<app>/<target>/build/<macos|windows|linux>`; the command prints each file's path.

`akan release-ios <app> [--target <target>] [--env <env>] [--team <team>] [--ad-hoc <boolean>] [--write <boolean>] [--allow-local-release <boolean>]`

Build and sign the iOS app for an App Store release: an iPhone app and its `.ipa`. It defaults to the `main` backend and refuses `--env local` unless `--allow-local-release` is passed.

- --target (String): A key of `native.targets` in `akan.config.ts`, or `all`. Asked for when there are several.

- --env (String, default main, debug | develop | main | local): Backend environment the app connects to.

- --team (String, -T): The Apple team id the signing is narrowed to, when the Mac holds profiles of several teams.

- --ad-hoc (Boolean, default false): Sign with an ad-hoc profile instead of an App Store one.

- --write (Boolean, default true): Run `akan sync` first so generated files are current.

- --allow-local-release (Boolean, default false, -l): Allow a release built with `--env local`.

- signing: The certificate and profile are found among the ones Xcode keeps on this Mac: the profile must cover the app id and every capability the app asks for. The command prints the one it used.

- output: Written under `dist/native/<app>/<target>/build/ios`; the command prints each file's path.

`akan release-android <app> [--assemble-type <type>] [--target <target>] [--env <env>] [--write <boolean>] [--allow-local-release <boolean>]`

Build and sign the Android app for a Play Store release, as an AAB or an APK. Like `release-ios`, it defaults to `main` and refuses `--env local` without `--allow-local-release`.

- --assemble-type (String, default aab, aab | apk): `aab` for a Play Store upload, `apk` for direct installs.

- --target (String): A key of `native.targets` in `akan.config.ts`, or `all`. Asked for when there are several.

- --env (String, default main, debug | develop | main | local): Backend environment the app connects to.

- --write (Boolean, default true): Run `akan sync` first so generated files are current.

- --allow-local-release (Boolean, default false, -l): Allow a release built with `--env local`.

- signing: Signed with the upload key the environment names: `MYAPP_RELEASE_STORE_FILE`, `MYAPP_RELEASE_STORE_PASSWORD` and `MYAPP_RELEASE_KEY_ALIAS`, plus `MYAPP_RELEASE_KEY_PASSWORD` when the key has its own. A missing one stops the command before it builds.

- output: Written under `dist/native/<app>/<target>/build/android`; the command prints each file's path.

`akan update-keygen <app> [--platform <platform>] [--target <target>]`

Make, once per app id, the Ed25519 key update releases are signed with, and print its public key for `native.updates.publicKeys`. Run again, it reads the key it made. The key lives in `~/.akan/native/keys/<app id>.update.key`, or where `AKAN_NATIVE_UPDATE_KEY` points: keep it in the secret store the release machine reads, since an installed app takes no release it cannot verify. An `appId` that differs per platform has a key per id, so name the `--platform` you publish for. It also prints the key's keyId, the name `publish-update --revoke` and `native.updates.revokedKeys` call it by.

- --platform (String, default desktop, desktop | android | ios): The platform whose app id the key signs for.

- --target (String): A key of `native.targets` in `akan.config.ts`, or `all`. Asked for when there are several.

`akan publish-update <app> [--platform <platform>] [--target <target>] [--env <env>] [--channel <channel>] [--upload <s3://bucket/prefix>] [--arch <arm64|x64>] [--sign <boolean>] [--notarize <boolean>] [--revoke <keyId,...>] [--reset-sequence <boolean>] [--write <boolean>] [--allow-local-release <boolean>]`

Build a release and sign it for installed apps: the whole app for a desktop (this computer's OS and CPU, delta from the release before), the web bundle for Android and iOS. It writes the signed manifest and its files under `dist/native/<app>/<target>/updates`. Upload this release's files to `native.updates.url` and its manifest last, or let `--upload` do it; do not upload the folder whole, since a phone's folder is also where `pack-update` writes by default. A phone's manifest is one envelope per binary generation, `<platform>/<channel>/<nativeApi>.json`; a desktop's is `<channel>.json` and its `.sig`, which a CDN must not cache apart. A desktop release of a target that carries its server carries it too.

- --platform (String, default desktop, desktop | android | ios): `desktop` is this computer's own OS and CPU.

- --target (String): A key of `native.targets` in `akan.config.ts`, or `all`. Asked for when there are several.

- --env (String, default main, debug | develop | main | local): Backend environment the app connects to.

- --channel (String): Default `updates.channel`, else `--env`. It names only the manifest written, not the channel the release follows.

- --upload (String): `s3://<bucket>/<prefix>` to upload the release just published to: its files first, then its signature and its manifest or envelope; a file the bucket already holds is skipped. It sends nothing else from the folder — no `pack-update` record, no other channel's or native API's manifest — and nothing at all when that release is missing or fails a check. The credentials and endpoint come from `S3_*` or `AWS_*`, and it takes one target at a time.

- --arch (String, default this computer's, arm64 | x64): Desktop only: the CPU of the apps the release updates, written to that CPU's feed folder. A macOS release is arm64 only.

- --sign (Boolean, default false): Sign a desktop release with the identity `AKAN_NATIVE_MACOS_*` or `AKAN_NATIVE_WINDOWS_*` names. A signed installed app takes only a release signed the same way, so publish with `--sign` when the downloaded app was signed.

- --notarize (Boolean, default false): macOS: upload the signed app to Apple's notary service and staple the ticket. It takes `--sign` and the notary credentials (`AKAN_NATIVE_MACOS_NOTARY_*`).

- --revoke (String): Android and iOS: keyIds of `updates.publicKeys` this release starts revoking, comma-separated.

- --reset-sequence (Boolean, default false, -R): With `--revoke`, phones compare the release with their binary's own bundle instead of the running one.

- --write (Boolean, default true): Run `akan sync` first so generated files are current.

- --allow-local-release (Boolean, default false, -l): Allow a release built with `--env local`.

- desktop.server: With `native: { desktop: { server: true } }` in `akan.config.ts`, or `desktop.server` in one target, the desktop app carries the app's server: it starts beside the window on a loopback port and the pages call nothing else. `build-desktop`, `start-desktop --release` and `publish-update` all read it. An installed app refuses an update that adds or drops the server, so turning it on or off for an app already out there takes a reinstall.

- --env: An app takes releases on `updates.channel`, else on the `--env` it was built with: publish with that `--env`.

- pilot: A release keeps its build's channel: give a pilot group a target whose `updates.channel` is the pilot's.

- server change: Refused before it builds when the channel's last release differs in carrying a server, as installed apps would refuse it: publish on another channel (`updates.channel`) or remove its `<channel>.json` from the output folder to start over.

- readable: Anyone who reaches `updates.url` can read the release; the updater sends no credentials. A desktop release is the whole app, the carried server's `private/` and env file included.

- revocation: A phone release revokes `updates.revokedKeys`, the channel's published revocations and `--revoke` together, and is signed by a key listed after them all.

- refused: Before the build: a keyId the ring lacks, over 16 revoked keys, `-R` revoking nothing, either flag on a desktop, a signer not listed after them.

- leaked key: Sign with a spare (`AKAN_NATIVE_UPDATE_KEY`), `--revoke` the key on every phone platform and channel, then list it in `updates.revokedKeys`.

- native API: The CLI needs the native build API 0.12.0 or later in the app's akanjs: install matching versions of akanjs and @akanjs/cli.

`akan pack-update <app> --platform <platform> [--target <target>] [--env <env>] [--out <dir>] [--against <bundle.json>] [--write <boolean>] [--allow-local-release <boolean>]`

Pack an Android or iOS web bundle update unsigned, for a signer that keeps the key off this machine: `files/<sha256>`, `bundle.json`, `manifest.template.json` with `channel`, `sequence` and `bundle` left for the signer, and `pack.json`, the record a pipeline reads. The signer uploads `files/` first, then the signed envelope at `<platform>/<channel>/<nativeApi>.json`. Exits 2 when `--against` says the bundle needs a new store build; any other failure, its web build included, exits 1 and leaves no `pack.json` behind. `publish-update` does the same with a key on this machine.

- --platform (String, ios | android): The app it updates.

- --target (String): A key of `native.targets` in `akan.config.ts`, or `all`. Asked for when there are several.

- --env (String, default main, debug | develop | main | local): Backend environment the app connects to.

- --out (String): Default `dist/native/<app>/<target>/updates/<platform>`.

- --against (String): The `bundle.json` of the store build it must run in: writes `compat.json`, and fails when the bundle needs a new binary.

- --write (Boolean, default true): Run `akan sync` first so generated files are current.

- --allow-local-release (Boolean, default false, -l): Allow a release built with `--env local`.

`akan push-update <app> [--platform <platform>] [--target <target>] [--env <env>] [--channel <channel>] [--notes <text>] [--subspace <name>] [--host <url>] [--write <boolean>] [--allow-local-release <boolean>] [--pack <dir>]`

Pack an update as `pack-update` does, or take the folder it wrote with `--pack`, and upload it to the Akan Cloud project, which keeps the key, signs and publishes it. The channel defaults to the target's `updates.channel`. It exits 2 when the pack needs a new store build or the project rejects it, and prints why; any other failure exits 1.

- --platform (String, ios | android): The app it updates. Required to pack; with `--pack` it defaults to the pack's.

- --target (String): A key of `native.targets`. Left out, the only target, so an app with several needs it to pack; with `--pack`, the pack's.

- --env (String, default main, debug | develop | main | local): Backend environment the app connects to; with `--pack`, the pack's.

- --channel (String, default updates.channel): The channel the project publishes the release on.

- --notes (String): Release notes the project shows with the release.

- --subspace (String): A subspace of the root `akan.config.ts`: the project its `workspaceId` names gets it. Left out, the project `AKAN_WORKSPACE_ID` names.

- --host (String): The cloud to send to. Left out, `cloud.host` of the root `akan.config.ts`, else Akan Cloud (`https://cloud.akanjs.com`).

- --write (Boolean, default true): Run `akan sync` first so generated files are current.

- --allow-local-release (Boolean, default false, -l): Allow packing with `--env local`, or uploading a pack made with it.

- --pack (String, -d): A folder `pack-update` already wrote, uploaded as it is instead of packing again. It must be this app's, and `--platform`, `--target` and `--env`, when given, must match it. A pack its `--against` check refused exits 2 without uploading.

- --subspace: The subspace must declare the app in the root `akan.config.ts`, or the command stops before it packs.

`akan register-binary <app> --platform <platform> --distribution <distribution> [--target <target>] [--env <env>] [--subspace <name>] [--host <url>] [--write <boolean>] [--allow-local-release <boolean>]`

After `release-ios` or `release-android`, register that store build with the Akan Cloud project, with a pack of the same commit as its embedded bundle. Refused when the store build is not this commit's `--env` build — its web bundle, native API or update channel differs from the pack's, as when a later native build of the target overwrote `build/<platform>/bundle.json`. That refusal exits 2; any other failure exits 1.

- --platform (String, ios | android): The store build to register.

- --distribution (String, appStore | testFlight | playStore | playTesting | direct): Where the binary ships.

- --target (String): One key of `native.targets` in `akan.config.ts`; `all` is not taken. Asked for when there are several.

- --env (String, default main, debug | develop | main | local): Backend environment the app connects to.

- --subspace (String): A subspace of the root `akan.config.ts`: the project its `workspaceId` names gets it. Left out, the project `AKAN_WORKSPACE_ID` names.

- --host (String): The cloud to send to. Left out, `cloud.host` of the root `akan.config.ts`, else Akan Cloud (`https://cloud.akanjs.com`).

- --write (Boolean, default true): Run `akan sync` first so generated files are current.

- --allow-local-release (Boolean, default false, -l): Allow a release built with `--env local`.

- --subspace: The subspace must declare the app in the root `akan.config.ts`, or the command stops before it packs.

Rules Every Command Shares

**Choosing the app.** `<app>` is a folder name under `apps/`. Leave it out and the CLI asks you to pick, or takes the only app there is.

**Without a terminal, a missing argument is an error.** When stdin is piped or closed, as in CI, a missing argument, option, app, library, package or module is not asked for: the command fails at once with an error that says which is missing and, where there is a list, what it may be.

**Boolean options.** `--fast` on its own means true. To turn an option off, give the value: `--write false`.

**Short flags.** Each option also answers to its first letter (`-w` for `--write`) unless its row shows another. `--verbose` (`-v`) works on every command.

**`--write` runs sync first.** It is on by default, so generated files are fresh before the command runs. `--write false` skips it.

**The database mode.** `start`, `build`, `script`, `console`, `db-export` and `db-import` use the shell's `AKAN_DATABASE_MODE`, which must be one the app declares, or else its first declared mode.

Short Names

Short name

Runs

- akan b — akan build

- akan t — akan typecheck

- akan s — akan start

- akan bi — akan build-ios

- akan ba — akan build-android

- akan bd — akan build-desktop

- akan si — akan start-ios

- akan sa — akan start-android

- akan sd — akan start-desktop

## Code Examples

### create-application

```bash
akan create-application blog
akan create-application blog --start true
```

### remove-application

```bash
akan remove-application blog
```

### sync

```bash
akan sync myapp
akan sync util
```

### plan-slice

```bash
akan plan-slice myapp
akan plan-slice myapp --format json
```

### start

```bash
akan start myapp
akan start myapp,admin --concurrency 2
akan start all --kill true --plain true
akan start myapp --share true
```

### dbup

```bash
akan dbup
akan dbup --mode multiple
akan dbup --mode cluster
```

### dbdown

```bash
akan dbdown
```

### db-export

```bash
akan db-export myapp
SQLITE_DATABASE_PATH=$PWD/backup/myapp-main.db \
  akan db-export myapp --dir local/transfer/main
```

### db-import

```bash
akan db-import myapp
AKAN_DATABASE_MODE=cluster \
  POSTGRES_URL=postgres://app:secret@db.example.com:5432/app \
  REDIS_URI=redis://redis.example.com:6379 \
  akan db-import myapp
```

### script

```bash
akan script myapp
akan script myapp seed.ts
```

### console

```bash
akan console myapp
docker exec -it myapp sh -lc 'AKAN_CONSOLE=1 bun console.js'
kubectl exec -it -n prod pod/myapp-xxxxx -c myapp -- sh -lc 'AKAN_CONSOLE=1 bun console.js'
```

### logs

```bash
akan logs myapp --level warn
akan logs myapp --endpoint 'mutation:*' --replay 200
akan logs myapp --trace 0f3c9a1b --follow false
akan logs myapp --json true | jq 'select(.attrs.userId)'
```

### typecheck

```bash
akan typecheck myapp
akan typecheck util
akan typecheck myapp --tests false
akan typecheck myapp --clean true --incremental false
```

### test

```bash
akan test myapp
akan test myapp --write false
akan test util
```

### build

```bash
akan build myapp
akan build myapp --write true --fast false --quiet false
akan build myapp --profile edge
```

### start-ios

```bash
akan start-ios myapp --target default --env local
akan start-ios myapp --device "iPhone 17"
akan start-ios myapp --device "Jane's iPhone" --team ABCDE12345
```

### start-android

```bash
akan start-android myapp --target default --env local
akan start-android myapp --device Pixel_10
```

### start-desktop

```bash
akan start-desktop myapp --target default
akan start-desktop myapp --target kiosk
akan start-desktop myapp --target kiosk --release true --env debug
```

### build-ios

```bash
akan build-ios myapp --target all --env debug
```

### build-android

```bash
akan build-android myapp --target all --env debug
```

### build-desktop

```bash
akan build-desktop myapp --target default
akan build-desktop myapp --target kiosk --env main
akan build-desktop myapp --installer true --env main
akan build-desktop myapp --installer true --env main --sign true --notarize true
```

### release-ios

```bash
akan release-ios myapp --target all --env main
akan release-ios myapp --target default --ad-hoc true
```

### release-android

```bash
akan release-android myapp --target all --env main
akan release-android myapp --assemble-type apk --target all --env main
```

### update-keygen

```bash
akan update-keygen myapp
akan update-keygen myapp --platform android
```

### publish-update

```bash
akan publish-update myapp --env main
akan publish-update myapp --target pilot --env main
akan publish-update myapp --env main --sign true --notarize true --upload s3://releases/myapp
akan publish-update myapp --platform android --env main
AKAN_NATIVE_UPDATE_KEY=./spare.update.key akan publish-update myapp --platform ios --env main --revoke 0123456789abcdef
```

### pack-update

```bash
akan pack-update myapp --platform android --env main
akan pack-update myapp --platform ios --env main --against store/bundle.json
```

### push-update

```bash
akan push-update myapp --platform android --env main --notes "Fix the login screen"
akan pack-update myapp --platform ios --env main --against store/bundle.json && akan push-update myapp --pack dist/native/myapp/default/updates/ios
```

### register-binary

```bash
akan release-android myapp --env main && akan register-binary myapp --platform android --distribution playTesting
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

