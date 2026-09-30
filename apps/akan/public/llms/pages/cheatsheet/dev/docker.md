# Docker

- Source: /cheatsheet/dev/docker
- Mirror: /llms/pages/cheatsheet/dev/docker.md
- Section: cheatsheet
- Category: Development
- Priority: P2

## Headings

- Docker (#overview)
- Minimal Compose (#compose)
- Container Env (#env)
- Scale With AKAN_REPLICA (#replica)
- Several Containers On One Host (#multiple-host)
- Trim The Web Surface (#web-surface)
- Customize The Image (#dockerfile)
- Open Console (#console)
- Tips (#tips)

## Content

Docker

Say you have a built app and a small machine at the edge of a factory floor. It has to come back after a power cut with its data intact, and you need to see why it fell over.

For a small edge server, start with one Akan app container. Plan around these image defaults:

Image default

What it means for you

- PORT=8282: The app listens on 8282, so publish `8282:8282`.

- /workspace/sqlite: The sqlite files land here, so mount a volume on it to survive restarts.

- AKAN_LOG_TO_FILE=0: File logging is off, so collect stdout or set it to 1 and mount a log volume.

- ca-certificates, tzdata: The only packages installed, so declare ffmpeg or Chromium in `docker.preRuns`.

- console.js: It ships next to `main.js`, so you open an operator console with `docker exec`.

**Why file logging is off:** a container's writable layer is thrown away with the container, so the files would only fill the disk. stdout is the collection path.

Minimal Compose

A simplified compose file for one app. Replace `myapp` and the image name with your own:

**`restart: unless-stopped`** brings the container back after a power cut or a reboot.

**Two volumes** keep the sqlite files and the log files on the host.

**`AKAN_PUBLIC_OPERATION_MODE: edge`** marks an on-premise box. The image default is `cloud`.

**`AKAN_DATABASE_MODE: single`** keeps every piece of data in the SQLite files on the volume. You may leave it out when the app declares only `single`.

**The container side of the port is 8282, not 80.** Nothing in the image listens on 80, because `AkanApp` binds `PORT`. Map `"8282:8282"`, or set `PORT: 80` as well.

Container Env

The image already carries the build's values, so a container sets only the ones that differ.

Required — set by the build

The app does not start without these three.

- AKAN_PUBLIC_APP_NAME (string, default from the build): The app's codename.

- AKAN_PUBLIC_REPO_NAME (string, default from the build): The workspace name.

- AKAN_PUBLIC_SERVE_DOMAIN (string, default from the build): The base domain the app derives its own origins from.

Commonly changed

- AKAN_PUBLIC_ENV (local | testing | debug | develop | main, default from the build (debug)): Which deployment this is. The Helm chart sets it per namespace. An image carries only the server env it was built with, so it runs that environment and no other.

- AKAN_PUBLIC_OPERATION_MODE (local | edge | cloud | module, default cloud in the image): Where it runs. The on-premise box in this page's example is `edge`.

- AKAN_DATABASE_MODE (single | multiple | cluster, default the app's only declared mode): Picks one of the modes `database.modes` declares. Required when the app declares several.

- PORT (number, default 8282): The port the gateway or the solo process binds.

- AKAN_SQLITE_DIR (string, default /workspace/sqlite in the image): Where the sqlite files go. Point it at a mounted volume.

- AKAN_LOG_TO_FILE (0 | 1, default 0 in the image): Rotating log files. Set 1 and mount `AKAN_LOG_DIR` to get them back.

- AKAN_LOG_DIR (string, default /workspace/runtime/logs in the image): Where the rotating log files go when file logging is on.

- AKAN_CONSOLE (1, default unset): Required to open `console.js` in a production-like environment.

Where the data lives

These say where the data and the uploads live. Set on the container, each wins over the same value bundled from `env.server.ts`, so one image serves every deployment.

- SQLITE_DATABASE_PATH (string, default <AKAN_SQLITE_DIR>/<app>-<env>.db, single · multiple): The SQLite database file. In `multiple`, every container on the host opens this one file.

- AKAN_SOLID_DB_PATH (string, default <AKAN_SQLITE_DIR>/<app>-<env>_solid.db, single): The SQLite file that holds the cache, queue and pubsub.

- REDIS_URI (string, multiple · cluster): The Redis for the cache, queue and pubsub. Required; `rediss://` connects over TLS.

- POSTGRES_URL (string, cluster): The Postgres database. Pool size, SSL and prepared statements ride its query string. — Example: `postgres://app:secret@db:5432/app?max=20&ssl=require`

- AKAN_STORAGE_SHARED (true, multiple · cluster): Says `/workspace/local`, where uploads land, is one volume every instance mounts.

**Behind PgBouncer in transaction mode, also add `&prepare=false`** to that query string.

**Postgres also takes separate parts.** Without a URL it reads `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DATABASE` (or `POSTGRES_DB`), `POSTGRES_USER` and `POSTGRES_PASSWORD`.

**`USE_AKANJS_PKGS` is not a container variable.** It is a workspace-development flag the CLI reads, and setting it in a deployment does nothing.

Scale With AKAN_REPLICA

`AKAN_REPLICA` is three counts separated by commas, and each position is a role. It decides how many processes run and whether a gateway sits in front of them.

Words used on this page

Term

- replica: One server process that serves requests, runs background work, or both.

- gateway: A front process that binds PORT and spreads traffic across the replicas.

- solo: One replica running as the container's only process, with no gateway.

- internal: Background work a signal declares, such as cron, interval and queue jobs.

- RSC worker: The separate process that renders pages, one per web-serving replica.

The three slots

Slot

Role

Default

What it does

- 1 — federation — 0 — Serves requests. Skips internals pinned to `serverMode: "batch"`.

- 2 — batch — 0 — Runs internals and never listens. Asking for one always keeps the gateway.

- 3 — all — 1 — Serves requests and runs every internal.

Value examples

Whether the container answers requests, and whether an internal pinned to `serverMode: "batch"` runs in it:

Requests

batch internals — serverMode: "batch"

- Solo — one process, no gateway

  - (unset): Same as `"0,0,1"`: one all-purpose replica.

  - "1,0,0": One federation replica.

  - "0,0,0": Becomes one all-purpose replica. You can never ask for none.

- Gateway in front

  - "2": Two federation replicas. Missing slots count as zero.

  - "0,1,0": One batch replica. The gateway stays to answer health checks.

handled

not handled

Solo or gateway

One process, or a gateway and its children

total = 1 and batch = 0?

Solo: the container's only process

binds PORT

Gateway: binds PORT and proxies

RSC worker

federation child

batch child

never listens

yes

no · AKAN_SOLO=false · akan start

**Solo skips the gateway.** With one request-serving replica there is nothing to balance, so the replica runs in the container's only process with no proxy hop.

**Bringing the gateway back.** Set `AKAN_SOLO=false` (or `0`); `true` does nothing. `akan start` and a `replica` passed to `new AkanApp(...)` keep it too.

**Solo answers probes itself.** `/_akan/app/health`, `/_akan/app/metrics` and `/_akan/bench/ping` come back in the gateway's shape.

**Nothing supervises a solo process** but the orchestrator's probes.

Several Containers On One Host

When one container is not enough, run several copies on the same host in the `multiple` database mode. They open one SQLite file on a host volume and share one Redis for the cache, queue and pubsub.

Mode

Database

Cache · queue · pubsub

Runs on

- single — A SQLite file — SQLite files — One container

- multiple — One SQLite file on a host volume — Redis — Several containers on one host

- cluster — Postgres — Redis — Several servers

The app's build has to declare the mode, as in `database: { modes: ["multiple"] }` in `akan.config.ts`. Then run the image with a compose file like this:

**One database file for every replica.** `SQLITE_DATABASE_PATH` points each container at the same file on the `app-data` volume.

**`REDIS_URI` is required.** The cache, queue and pubsub live in that Redis, and a deployed app has no fallback for it.

**Uploads go on a volume every replica mounts.** `app-files` sits on `/workspace/local`, and `AKAN_STORAGE_SHARED` says so. Without it or object storage, the app refuses to keep files on one container's disk.

**A reverse proxy in front balances the replicas.** They publish no port of their own.

**Keep the SQLite file on the host's own disk.** Containers on one host share it through a named volume or a bind mount, but not over NFS or another network filesystem. Several hosts need `cluster`.

Trim The Web Surface

A deployment that only answers API calls does not need the web half. Leave it out of the build to shrink the image, or turn it off at boot to shrink the processes.

Setting

- akan.config.ts — what the build puts in the image

  - web: true: The default. Both surfaces are built.

  - web: { csr: false }: Drops the mobile SPA bundle and keeps SSR.

  - web: false: API only: no route artifact, CSR bundle, RSC worker entrypoint or `public/`.

- Container env — narrows at boot

  - AKAN_CSR=false: Takes down only the mobile SPA bundle.

  - AKAN_SSR=false: Takes down the RSC worker and the render routes, and CSR with them.

served

off

**The env only narrows.** `false` or `0` turns a surface off, and nothing turns back on a surface the build left out.

**There is no CSR without SSR.** The CSR bundle inlines the stylesheet the SSR build compiles, so `AKAN_SSR=false` takes CSR down whatever `AKAN_CSR` says.

**`web: false` shrinks the image.** Measured on this docs app, the image went from 86MB to 6.2MB.

An API-only container with one request-serving replica:

**`AKAN_SSR=false` drops the RSC worker process.** On this docs app, 350MB across three processes became 120MB across two.

**`"1,0,0"` is one federation replica,** so an internal pinned to `serverMode: "batch"` does not run in this container.

Customize The Image

You do not write a Dockerfile; the `docker` key in `akan.config.ts` shapes the image. The image installs only `ca-certificates` and `tzdata`, so an app that needs ffmpeg or Chromium has to say so.

- image (string | { amd64?, arm64? }, default oven/bun:1-slim): The base image. The object form picks one per architecture; a missing one uses the default.

- preRuns ((string | { amd64?, arm64? })[], default []): Commands run before `bun install`, such as a system package a native dependency needs.

- postRuns ((string | { amd64?, arm64? })[], default []): Commands run after `bun install`, before the app files are copied.

- command (string[], default ["bun", "main.js"]): The container's `CMD`.

An app that needs ffmpeg, plus one step that runs only on arm64:

**Write the command, not `RUN`.** Akan adds `RUN` to each step, and the object form runs only on the matching `TARGETARCH`.

**Libs add their own steps.** Every app that mounts a lib gets its steps first, with duplicates removed. A lib never picks the base image or the command.

**Unused fonts are trimmed.** `assets.pruneFonts` is on by default and trims them from the `dist` copy of `public/`; source trees are never touched.

**`keepFonts` is relative to its own `public/`.** The glob is read against the declaring app's or lib's folder. Under `assets`, a lib may set only this key.

**A Dockerfile string drops every lib step.** Writing `docker` as a whole Dockerfile string uses it verbatim, and the steps libs contributed silently disappear. Use the object form unless you really need the whole file.

Open Console

The image ships `console.js` next to `main.js`, so you can open an operator console without creating files in the container. Set `AKAN_CONSOLE=1` on the exec command only:

**Why the flag.** The console refuses to open when `AKAN_PUBLIC_ENV` is `main`, the operation mode is `cloud` or `edge`, or `NODE_ENV` is `production`.

**So the image always needs it,** since the image sets `NODE_ENV=production` and `AKAN_PUBLIC_OPERATION_MODE=cloud`. Keep it out of the compose file so only the exec opens a console.

**It does not double the app's background work.** The console process starts services but runs no internal jobs or queue workers, so the running container keeps them.

Tips

**Keep the first compose file boring.** Add services only when the app really needs them.

**Back up the sqlite volume before replacing edge hardware.** It holds `<app>-<env>.db` and `<app>-<env>_solid.db`.

**A restart loop shows up in stdout.** Read `docker logs myapp`, not the mounted folder: file logging is off in the image unless you turned it back on.

Read next

- Akan Runtime — The runtime environment variables in depth, including the logging ones.

- Kubernetes — The same image on a cluster, with the Helm chart and its probes.

- Move Data Between Modes — Copy an app's data from one database mode into another with `db-export` and `db-import`.

- Server Console — What you can do once the console is open.

- Logging — Reading and filtering the logs a container writes.

## Code Examples

### docker-compose.yaml

```ts
services:
  myapp:
    image: registry.mydomain.com/myorg/myapp:latest
    container_name: myapp
    restart: unless-stopped
    ports:
      - "8282:8282"
    environment:
      AKAN_PUBLIC_APP_NAME: myapp
      AKAN_PUBLIC_REPO_NAME: myorg
      AKAN_PUBLIC_SERVE_DOMAIN: example.com
      AKAN_PUBLIC_ENV: main
      AKAN_PUBLIC_OPERATION_MODE: edge
      AKAN_DATABASE_MODE: single
      AKAN_REPLICA: "0,0,1"
      AKAN_SQLITE_DIR: /workspace/sqlite
      AKAN_LOG_TO_FILE: "1"
      AKAN_LOG_DIR: /workspace/logs
    volumes:
      - ./sqlite:/workspace/sqlite
      - ./logs:/workspace/logs
```

### docker-compose.yaml

```ts
services:
  redis:
    image: redis:8
  myapp:
    image: registry.mydomain.com/myorg/myapp:latest
    deploy:
      replicas: 3
    environment:
      AKAN_DATABASE_MODE: multiple
      REDIS_URI: redis://redis:6379
      SQLITE_DATABASE_PATH: /data/myapp.db
      AKAN_STORAGE_SHARED: "true"
    volumes:
      - app-data:/data
      - app-files:/workspace/local
volumes:
  app-data:
  app-files:
```

### Terminal

```bash
docker run -e AKAN_SSR=false -e AKAN_REPLICA="1,0,0" -p 8282:8282 myapp
```

### apps/myapp/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  docker: {
    preRuns: ["apt-get update && apt-get install -y --no-install-recommends ffmpeg"],
    postRuns: [{ arm64: "echo aarch64 image" }],
  },
  assets: {
    pruneFonts: true,
    keepFonts: ["fonts/Assistant-*.woff2"],
  },
};

export default config;
```

### Terminal

```bash
docker exec -it myapp sh -lc 'AKAN_CONSOLE=1 bun console.js'
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

