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

The app listens on 8282, so publish `8282:8282`.

The sqlite files land here, so mount a volume on it to survive restarts.

File logging is off, so collect stdout or set it to 1 and mount a log volume.

The only packages installed, so declare ffmpeg or Chromium in `docker.preRuns`.

It ships next to `main.js`, so you open an operator console with `docker exec`.

from the build

The app's codename.

The workspace name.

The base domain the app derives its own origins from.

from the build (debug)

Which deployment this is. The Helm chart sets it per namespace.

cloud in the image

Where it runs. The on-premise box in this page's example is `edge`.

the app's only declared mode

Picks one of the modes `database.modes` declares. Required when the app declares several.

The port the gateway or the solo process binds.

/workspace/sqlite in the image

Where the sqlite files go. Point it at a mounted volume.

0 in the image

Rotating log files. Set 1 and mount `AKAN_LOG_DIR` to get them back.

/workspace/runtime/logs in the image

Where the rotating log files go when file logging is on.

unset

Required to open `console.js` in a production-like environment.

The SQLite database file. In `multiple`, every container on the host opens this one file.

The SQLite file that holds the cache, queue and pubsub.

The Redis for the cache, queue and pubsub. Required; `rediss://` connects over TLS.

The Postgres database. Pool size, SSL and prepared statements ride its query string.

Says `/workspace/local`, where uploads land, is one volume every instance mounts.

Mode

Database

Cache · queue · pubsub

Runs on

A SQLite file

SQLite files

One container

One SQLite file on a host volume

Several containers on one host

Several servers

One server process that serves requests, runs background work, or both.

A front process that binds PORT and spreads traffic across the replicas.

One replica running as the container's only process, with no gateway.

Background work a signal declares, such as cron, interval and queue jobs.

The separate process that renders pages, one per web-serving replica.

Serves requests. Skips internals pinned to `serverMode: "batch"`.

Runs internals and never listens. Asking for one always keeps the gateway.

Serves requests and runs every internal.

Requests

batch internals

Solo — one process, no gateway

(unset)

Same as `"0,0,1"`: one all-purpose replica.

One federation replica.

Becomes one all-purpose replica. You can never ask for none.

Gateway in front

Two federation replicas. Missing slots count as zero.

One batch replica. The gateway stays to answer health checks.

akan.config.ts — what the build puts in the image

The default. Both surfaces are built.

Drops the mobile SPA bundle and keeps SSR.

API only: no route artifact, CSR bundle, RSC worker entrypoint or `public/`.

Container env — narrows at boot

Takes down only the mobile SPA bundle.

Takes down the RSC worker and the render routes, and CSR with them.

The base image. The object form picks one per architecture; a missing one uses the default.

Commands run before `bun install`, such as a system package a native dependency needs.

Commands run after `bun install`, before the app files are copied.

The container's `CMD`.

Akan Runtime

The runtime environment variables in depth, including the logging ones.

Kubernetes

The same image on a cluster, with the Helm chart and its probes.

Move Data Between Modes

Copy an app's data from one database mode into another with `db-export` and `db-import`.

Server Console

What you can do once the console is open.

Logging

Reading and filtering the logs a container writes.

Say you have a built app and a small machine at the edge of a factory floor. It has to come back after a power cut with its data intact, and you need to see why it fell over.

For a small edge server, start with one Akan app container. Plan around these image defaults:

Image default

What it means for you

Minimal Compose

Container Env

The image already carries the build's values, so a container sets only the ones that differ.

Required — set by the build

The app does not start without these three.

Commonly changed

Where the data lives

Scale With AKAN_REPLICA

Words used on this page

Term

The three slots

Slot

Role

Default

What it does

Value examples

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

Several Containers On One Host

Trim The Web Surface

A deployment that only answers API calls does not need the web half. Leave it out of the build to shrink the image, or turn it off at boot to shrink the processes.

Setting

served

off

An API-only container with one request-serving replica:

Customize The Image

An app that needs ffmpeg, plus one step that runs only on arm64:

Open Console

Tips

Read next

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

