<!-- akan:generated -->

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
| `bun main.js ops snapshot [--id] [--out] [--include-solid] [--json]` | `VACUUM INTO` a consistent copy, `integrity_check`, sha256, gzip, optional age encryption, `manifest.json` |
| `bun main.js ops restore <manifest.json> [--identity <file>]` | offline only: verify, stage, keep the old file as `<db>.pre-restore-<ts>` (its `-wal`/`-shm` beside it), swap |
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
  The control plane signs a short EdDSA JWS — `aud`, `iat`, `exp` at most 300s after `iat`, a `jti` the process
  refuses twice, and optionally `sub`, whom it acts for — and the host holds only the public half, so a machine
  someone carries off mints nothing.
  `aud` is `<appName>/<environment>`, or `<appName>/<environment>/<AKAN_OPS_INSTANCE>` when that is set, and then
  only that: a token minted for the app as a whole would replay across every host sharing the name. 30 calls a
  minute per process; every refusal is the same 401. A malformed key leaves the app serving with the channel off.
- **A migrate job runs for the token's `sub`**, which the run records as its actor: apply and rollback refuse a
  token without one, and a body naming `actor` is refused. Each option reaches the command as `--name=value`. One
  job runs at a time per process (409 meanwhile); the run's own lease keeps two hosts on one database apart. Jobs
  live in memory, so after a restart read the outcome from `list`. Polls count toward the 30 a minute.
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

## The Build Pipeline — `pipeline` In `akan.config.ts`

Akan Cloud builds and deploys each app as `build` → `docker` → `deploy`, and `ota` after them when asked. **An app's own stages go in
`apps/<app>/akan.config.ts` under `pipeline`; stages around every app go in the workspace root's
`akan.config.ts`**, typed `WorkspaceConfig`, under its own `pipeline` (`before`, `after`, `post`, `env`, `timeout`). Both are `import type`
objects (or `(ctx) => …`), and `akan pipeline dry-run | validate | plan` turns them into the plan Akan Cloud runs —
locally, running nothing.

```ts
const config: AppConfig = {
  pipeline: { stages: [{ use: "build" }, { name: "Test", sh: "bun run akan test web" }, { use: "docker" }, { use: "deploy" }] },
};
const config: WorkspaceConfig = {
  pipeline: { post: { failure: [{ name: "Notify", sh: "./scripts/notify.sh", secrets: ["DISCORD_WEBHOOK"] }] } },
};
```

- **A declared list is the whole pipeline.** Without `pipeline` an app runs the three actions; with it, write them
  — a list without `{ use: "deploy" }` never deploys. Each action appears at most once, in that order, and
  `docker` needs a `build` before it (the image is made from that build).
- **`{ use: "ota" }` ships the native web bundle over the air**, after `deploy` so the API it calls is already up.
  It is opt-in, makes its own CSR build, and packs every native target that declares `native.updates` for iOS
  and Android — `targets` and `platforms` narrow it, and a target without `updates` is a plan error. Akan Cloud
  signs and publishes the packs; the plan never holds a key.
- **A stage runs after the action before it.** Stages between two actions share a phase across apps, and a phase
  waits for every stage of the one before; `deploy` runs the apps one at a time in `after` order.
- **App stages stand on their own.** Never rely on what a root `before` stage left on disk: the root config never
  travels to a subspace, so an app built there runs its own stages only. Keep the files an app stage needs inside
  the app or its libs.
- **Secrets are named and write-only.** `akan upload-secret <NAME>` stores one per project (`--branch` for a
  branch-only value); a step lists it in `secrets` and reads `$NAME`. Anyone who can push to the repo can make a
  step print it — the GitHub Actions model — so push access is secret access.
- **`allowFailure` only means "this failure does not fail the run"**; how the run is reported is Akan Cloud's
  call. `env` and secret names may not be `CI`, `AKAN_CI_*` or shell names such as `PATH`, and every step gets
  `AKAN_CI_BRANCH`, `AKAN_CI_APP` and the rest of the build's facts.
- `akan pipeline` exits 0 with a plan, 1 with an envelope of errors, and 2 for anything else (no envelope). A lib
  config takes no `pipeline`; the root config takes no app or lib settings.
