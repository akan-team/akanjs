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

Run `akan sync` first so generated files are current.

A key of `mobile.targets` in `akan.config.ts`, or `all`. Asked for when there are several.

Backend environment the app connects to.

Delete the native project folder and generate it again.

Allow a release built with `--env local`.

Bundle a production web build into the app instead of loading the dev server.

alias

\`akan ${alias}\` runs this command.

dev server

Without `--release` the app loads from the dev server, so keep `akan start <app>` running.

one target

Works only when the app has one mobile target, since it takes no `--target`.

signing

Needs release signing keys in `android/gradle.properties` or `ORG_GRADLE_PROJECT_*` env vars.

Manage Apps

Create a new app under `apps/` from the template.

Delete an app's folder from the workspace.

Regenerate the generated files of an app or library.

List the files an app needs to move into a workspace of its own.

Local Development

Run the dev server for one or more apps.

Start the local database containers.

Stop the local database containers.

Copy an app's data out of one database mode and into another.

Run a file from the app's `script/` folder.

Open an interactive server console.

Follow a running app's logs, filtered.

Check and Build

Typecheck the app.

Run the tests of an app, library or package.

Build the app for production into `dist/apps/<app>`.

Mobile

Run the app on a simulator, an emulator or a connected device.

Build the native app with Capacitor.

Build the app for an App Store or Play Store release.

Create `apps/<appName>` from the app template, then sync it. With `--start` it also boots the dev server.

App name. It is lowercased, and spaces become hyphens.

Start the dev server and open the browser once the app is created.

Delete the `apps/<app>` folder, so the app drops out of sync, builds and deployment. Commit first if you may want it back.

Rescan an app or library and rewrite its generated files. Run it after adding, renaming or deleting a file, or after changing its imports.

generated files

Barrels like `index.ts`, `cnst.ts` and `st.ts`, `akan.<app|lib>.json`, and the scoped `AGENTS.md`.

dependencies

Each package the code imports is written into its own `package.json`, at the root's version.

apps only

Also links lib assets into `public/libs` and, with `syncPageLibs`, lib routes into `page/(libs)`.

run for you

`start`, `build`, `typecheck` and `test` run it first through `--write`.

Print the exact files an app needs to live in a workspace of its own. It only prints the plan and writes nothing.

Output format.

contents

The app, every lib it reaches, the workspace shell around them, and a root `package.json`.

file source

Files come from git, so gitignored files such as env values are left out.

root manifest

Keeps only the packages the slice imports, at the workspace's own version specs.

warnings

Untracked files under the app or its libs are listed, because git would not carry them.

Run the dev server, SSR frontend and backend together. Name apps space- or comma-separated, pass `all`, or leave them out to tick them in a checklist. Several apps share one session.

Print prefixed, interleaved lines instead of the full-screen view.

Free the dev ports first. A holder that is not an akan process is reported and left alone.

Apps booted at a time. Unset: the lower of half the memory ÷ 900MB and cores ÷ 4.

Start the local services of the mode each app runs in first. On exit it stops only what it started.

Open the app in the browser.

Also publish each app on a public URL through an akan tunnel. `s` in the view copies it.

plain output

A pipe, a redirect or a terminal with no size switches to `--plain` on its own.

session log

Each app writes `local/apps/<app>/runtime/dev.log`, except one app under `--plain`.

memory budget

`AKAN_MEMORY_LIMIT` lowers the memory `--concurrency` is derived from.

Start the local database services with Docker Compose: Redis for `multiple`, Redis and Postgres 18 for `cluster`. `akan start` already runs it unless `--dbup false`.

Start one mode's services; `single` needs none. Left out, every mode the workspace's apps declare.

Needs a running Docker daemon. Services already running are left as they are.

compose file

`local/docker-compose.yaml` is written on first use and then left to you.

missing service

An older compose file may lack one. Add it, or move the file aside to get the current template.

Stop the local database with `docker compose down` in `local/`. Every service of that compose project stops, whichever app started it.

Write every model table of the app to one NDJSON file each, from the database of the mode the shell names. Pair it with `db-import` to move data between modes, such as `single` to `cluster`.

Folder to write the files into, relative to the workspace root.

mode

The shell's `AKAN_DATABASE_MODE`, or the app's first declared mode.

deployed data

For a deployed `single` app, copy its SQLite file and point `SQLITE_DATABASE_PATH` at the copy.

no traffic

Boots the app without listening and without running cron or init jobs.

Read the files `db-export` wrote into the database of the mode the shell names. The app must declare that mode.

Folder to read the files from, relative to the workspace root.

rows

Rows move as stored, removed ones included. An existing id is replaced, so a rerun is safe.

text search

The search index is rebuilt after the import.

not moved

Sessions and queued jobs stay behind, so users sign in again. Copy uploads in `local/` yourself.

Sync the app, then run `apps/<app>/script/<filename>.ts` with Bun. Leave the filename out to pick one from a list.

A file directly in `script/`; the `.ts` suffix is optional. Subfolder paths are refused.

Open an interactive console for inspecting the app's services and data at runtime. `akan build` also writes `console.js` beside `main.js`, so the same console runs inside a container.

process

Boots a separate server with no traffic and no internal jobs; it never attaches to `main.js`.

globals

`srv`, `sig`, `db`, `cnst`, `dict` and `option` are ready at the prompt.

container

Run `AKAN_CONSOLE=1 bun console.js` inside a built container or pod.

production

Refused under `main` env, `cloud`/`edge` mode or `NODE_ENV=production` unless `AKAN_CONSOLE=1`.

Follow a running app's logs through its `akan-control.sock`. Every record carries the traceId, endpoint and origin of its call, so you filter by call rather than by text alone.

Lowest level to print.

Text the message must contain.

Endpoint globs, comma-separated: `mutation:*`, `query:userList`.

One request's traceId; collects every line that request wrote.

Replica indexes, comma-separated.

Process roles: `gateway`, `federation`, `batch`, `all`, `rsc-worker`.

Call origins: `http`, `websocket`, `mcp`, `internal`, `page`.

Only newer records: `30s`, `5m`, `2h`, `1d`, or epoch ms.

Buffered records to print before following. With `--follow false` it caps the history.

Print NDJSON records instead of rendered lines.

Keep streaming. `--follow false` prints the history and exits.

Folder holding `akan-control.sock`. Without it, `AKAN_RUNTIME_DIR` and then the default apply.

in the console

`akan console` has the same filters as `.tail` and `.trace <id>`.

Typecheck the app with TypeScript. It reuses an incremental cache, which `--clean` clears first.

Delete the incremental cache (`tsconfig.tsbuildinfo`) before checking.

Reuse the TypeScript incremental cache.

Prepare an app, library or package, then run its tests with `bun test --isolate` in that folder.

Sync an app target first. Libraries and packages are always prepared.

Build the app for production into `dist/apps/<app>`. It typechecks, then compiles the backend, the SSR routes and the CSR bundle.

Skip the typecheck step.

Hide the progress output and the build summary.

web surfaces

The SSR and CSR steps follow `web` in `akan.config.ts`; a surface turned off is skipped.

Run the iOS app on a simulator or a connected device. By default it loads from your local dev server; `--release` bundles a production web build instead.

Also open the native project in Xcode.

Lets Xcode make or update device provisioning profiles; `--no-allow-provisioning-updates` stops it.

Pick the run target without a prompt: a UDID, a device name, or a runtime such as `iOS 18`.

Run the Android app on an emulator or a connected device. It works like `start-ios`: the dev server by default, a bundled build with `--release`.

Also open the native project in Android Studio.

Build the iOS app with Capacitor. It first makes a production web build against `--env`, then runs the native build for each target.

Build a release APK of the Android app with Capacitor. Like `build-ios`, it makes a production web build against `--env` first.

Build the iOS app for an App Store release. It defaults to the `main` backend and refuses `--env local` unless `--allow-local-release` is passed.

Build the Android app for a Play Store release, as an APK or an AAB. Like `release-ios`, it defaults to `main` and refuses `--env local` without `--allow-local-release`.

`apk` for direct installs, `aab` for a Play Store upload.

output

Written under `apps/<app>/android/app/build/outputs/`; the command prints the path.

Application CLI

These commands carry an app from creation to release: create it, run it locally, check and build it, then ship it to mobile.

Command

Rules Every Command Shares

Short Names

Short name

Runs

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

