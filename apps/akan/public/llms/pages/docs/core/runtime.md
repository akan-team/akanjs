# Akan Runtime

- Source: /docs/core/runtime
- Mirror: /llms/pages/docs/core/runtime.md
- Section: docs
- Category: Core Concepts
- Priority: P0

## Headings

- Akan Runtime (#akan-runtime)
- Identity And Environment (#env-identity)
- Database Variables (#env-database)
- Text Search Variables (#env-search)
- Logging Variables (#env-logging)
- getEnv() (#get-env)
- OpenAPI JSON (#openapi-json)
- Selective Module Boot (#module-selection)
- Health, Metrics, Logs (#health-metrics-logs)

## Content

Akan Runtime

Akan applications run on a Bun-based runtime that connects app code, generated artifacts, server routes, and pages. The app entry point (main.ts) starts the runtime, and Akan handles the server shape behind it.

When Akan App starts, Akan Server prepares everything the app can serve. In practice, the runtime exposes four kinds of work.

Internal API (Queue, Timer, etc.): internal work that runs without a browser request.

API (HTTP, WebSocket): public communication for data requests and realtime updates.

SSR Pages (Web): web pages rendered by the server and sent to the browser.

CSR Page (Android, iOS): client-rendered pages used by mobile targets.

Runtime overview

App code runs in the Akan App, which runs the Akan Server, and the server exposes an internal API for queues and timers, an HTTP and WebSocket API, SSR pages for the web and CSR pages for Android and iOS.

AKAN_REPLICA decides how many server processes each role gets, and it defaults to 0,0,1 everywhere: one all server and nothing else. With a single traffic replica there is nothing to balance, so Akan App runs that server inside its own process instead of spawning it and proxying to it. The container holds one process, and every request skips a proxy hop.

all: runs both federation and batch behavior in one server process. This is the default, and the shape almost every deployment ships.

federation: serves browser traffic such as pages, API calls, and WebSocket connections.

batch: runs background work such as queues, timers, and scheduled jobs.

Default: one process, no gateway

The browser reaches one process in the container where Akan App and Akan Server run together, serving pages, API and WebSocket and running queues, timers and jobs; a separate RSC worker process exists only for web.

Five things bring the gateway back: two or more replicas, a batch-only replica that never listens, AKAN_SOLO=false, passing replica to new AkanApp(...), and akan start. Then Akan App spawns the servers and load-balances browser traffic across the ready federation and all processes.

Replica and server modes

The browser reaches the Akan App acting as gateway and load balancer inside the container; it spreads traffic over three federation servers for pages, API and WebSocket, and runs a batch server for queues, timers and jobs.

A single Akan App has built-in clustering. You can run multiple server replicas and let Akan App distribute traffic, without setting up separate local load-balancing tools such as nginx, docker compose, or pm2.

Identity And Environment

The root .env file decides which organization, domain, environment, operation mode, and log level the app uses while it runs. Most projects keep these values stable, but changing them lets the same app behave like a local, debug, develop, or production-like service.

Environment variables prefixed with AKAN_PUBLIC_ are public. They can be read by browser code, so never store secrets, private tokens, or credentials in them.

Four of those names answer who this app is and where it runs, and the first two are required:

required

Organization or repository namespace, usually fixed for the life of the project.

The domain the app builds links, callbacks, and domain-based routes from.

Which data set the app runs against, from local test data up to production-like main.

local when ENV=local, else cloud

Where clients connect: local runtime, cloud, or edge paths; module is only in the type.

In practice you move two of them together. Build a feature with ENV=local and OPERATION_MODE=local, switch ENV to debug or develop when you need shared data or shared services, and deploy with ENV=main against whichever operation mode the cluster serves:

Database Variables

the first declared mode

One of `database.modes`; a deployment of a build that declares several must set it.

/workspace/sqlite in the image

The folder for any SQLite file no path names: the database, and `single`'s cache and queue file.

Moves the database file alone, in `single` and `multiple`; it wins over `AKAN_SQLITE_DIR`.

The SQLite file where `single` keeps its cache, queue and pubsub.

The `cluster` database (alias `POSTGRES_URI`), with pool size and SSL in its query string.

The URL in parts, with `POSTGRES_PORT`, `POSTGRES_DATABASE`, `POSTGRES_USER`, `POSTGRES_PASSWORD`.

Logs the SQL console in on `cluster`, as a role that may read base columns only.

Only for an app that applies `LibsqlDatabase` itself; `LIBSQL_AUTH_TOKEN` carries its token.

required outside local

The one Redis every instance of `multiple` or `cluster` shares; `rediss://` turns on TLS.

Every instance mounts one upload volume; disk uploads in `multiple` and `cluster` need it.

Text Search Variables

Full-text search is on unless you switch it off, and both of its variables are deployment-wide decisions rather than per-process ones, so give every process in one deployment the same pair.

unset means on

Turns the full-text index off, reversibly.

fts5 tokenizer (Postgres: unicode61 or trigram); `database.search.tokenizer` in env.server.ts wins.

Changing the tokenizer rebuilds the index from the mirror on the next boot. Of processes restarted at once, the first rebuilds and the rest wait for it; on SQLite a process waits only up to its busy timeout, so stagger the restart when the mirror is large.

Logging Variables

The level ladder is trace, verbose, debug, info, warn, error, and three destinations read it independently: the container's stdout, the rotating log file, and any sink the app registered. Everything else here decides how much structure travels with a record and who is allowed to ask for more.

How much runtime output the console carries; the deprecated log means info.

What goes to the container's stdout, in either format; info is the production pick.

How much structured Logger output goes to files, independent of the console level.

text for people; ndjson makes stdout one JSON record per line, ndjson-only the file too.

Writes gateway and child logs to runtime/logs; off in the production image.

Where file logging writes, when the default directory is not where the volume is mounted.

Create the next sequence file when a process log reaches this size.

Keep this many rotated files per process key, such as gateway or child-0.

Tags each call's records with traceId, endpoint and origin; independent of AKAN_TRACE.

1 forwards child records to the gateway always, not only while akan logs or .tail listens.

unset — route absent

Mounts GET /_akan/app/logs, an SSE stream of the ring buffer, for a matching bearer token.

One record per call at its end; 1 or all logs every call, slow only failed or slow ones.

Buffers each call's last 64 sub-level records; promotes them if it failed or ran slow.

A call at least this long is slow, for the flight recorder and the slow canonical mode.

Caps the records the process holds at once; a call past the cap runs unrecorded.

How many records the in-memory hub keeps for akan logs and the SSE stream to replay.

The same buffer's byte ceiling; whichever limit is reached first applies.

unset — local only

The secret x-akan-debug must carry outside local to log that one request at trace.

The ring the gateway (or the solo replica) keeps for akan logs --replay and .trace holds AKAN_LOG_BUFFER records or AKAN_LOG_BUFFER_MB, 2,000 or 4 MB by default, whichever fills first, and the older record goes first.

getEnv()

getEnv() is the runtime helper that turns .env values into the information your app actually uses. Instead of hand-writing API URLs or WebSocket URLs, app code can read the prepared values from getEnv().

Local mode

When OPERATION_MODE is local, getEnv() points the browser and API client to your local Akan runtime, usually localhost:8282.

Cloud / edge mode

When OPERATION_MODE is cloud or edge, getEnv() builds service URLs from the app name, environment, and serve domain.

Use getEnv() when application code needs runtime addresses or environment identity. It keeps URL decisions in one place and makes local, cloud, and edge modes easier to switch.

OpenAPI JSON

Akan can expose the HTTP query and mutation surface declared in signal files as an OpenAPI 3.1 document. This is useful when you want to connect Swagger, Redoc, external clients, or SDK generation tools to the same API shape Akan already uses.

After enabling it, request /openapi.json from the app origin. In local mode, the document is usually available at localhost:8282/openapi.json. The normal API prefix stays at /api; OpenAPI JSON is served as a framework metadata route.

App option

Use this when the app should always expose OpenAPI JSON in that entry point.

Environment variable

Use this when deployment or local scripts should decide whether the endpoint is available.

Server option

Use this when you start AkanServer directly instead of going through AkanApp.

OpenAPI JSON is opt-in. Enable it only for environments where exposing API structure is acceptable, because it describes routes, request fields, response schemas, and guard metadata.

Selective Module Boot

An app mounts every module its libraries declare. The modules option narrows that: name the modules a process should serve and Akan boots those plus the ones they depend on, leaving the rest out of the container entirely. A module left out has no service, no signal, no route, and no scheduled job. This is how one codebase runs as several small processes, such as a batch worker that only needs its own domain.

Dependencies are followed for you, so you list entry points instead of the whole graph. A named module pulls in every service and signal it injects, and every model its cascade removes.

disableModules and disableLibs are the same idea from the other end: mount everything except what you name and whatever reaches it. disableModules takes module names, disableLibs takes the name of a library and stands for every module that library registered, so it does not drift as the library gains modules. Reach for either when the process serves most of the app and a library it depends on is one it does not use. Both are accepted in all three places modules is, as AKAN_DISABLE_MODULES and AKAN_DISABLE_LIBS in the environment. Naming a module in both modules and an exclusion leaves it out, because modules says what a process is for and the exclusions say what it must not run.

Use this when the entry point itself decides which modules the process serves. Every replica it spawns gets the same selection.

Use this when deployment decides the split, so one image can run as different processes without a second entry point.

Selection narrows the enabled set rather than replacing it, so it never turns on a module whose service is disabled. A module that reaches a disabled one goes with it. Endpoints of a module left out do not exist, so a client that calls one gets a 404.

Health, Metrics, Logs

Akan runtime exposes simple ways to check whether the app is alive, how busy it is, and what it is doing. In local development, these are mostly useful when a page does not load or a background job seems stuck.

Health

Use this to check whether the server processes are running and ready. A solo replica answers it itself, in the same shape the gateway uses, so a probe reads one contract either way.

Metrics

Use this to see runtime counts such as active requests, WebSocket connections, rooms, and process metrics.

Logs

Use AKAN_PUBLIC_LOG_LEVEL to choose how much detail appears in the terminal. AkanApp also stores gateway and child process output in runtime/logs by default, using AKAN_LOG_FILE_LEVEL for structured Logger output and rotating files by date and size.

File names include app name, environment, operation mode, local date, process key, and sequence. Direct console.log calls from child servers are captured through stdout/stderr pipes; direct gateway console.log calls are not part of Logger sink capture.

Runtime checks

Developer

Akan App

(gateway or solo)

Terminal Logs

Running / Ready

Requests, Sockets, Memory

Debug Details

Start with health when the app does not respond. Use metrics when the app responds but feels busy. Increase LOG_LEVEL or enable AKAN_MEMORY_LOG when you need more terminal detail.

## Code Examples

### apps/myapp/main.ts

```ts
import { AkanApp } from "akanjs/server/akanApp";

const run = async () => {
  await new AkanApp().start();
};
void run();
```

### .env

```bash
AKAN_PUBLIC_REPO_NAME=myorg
AKAN_PUBLIC_SERVE_DOMAIN="mydomain.com"
AKAN_PUBLIC_ENV=local
AKAN_PUBLIC_OPERATION_MODE=local
AKAN_PUBLIC_LOG_LEVEL=debug
AKAN_SEARCH_ENABLED=1
AKAN_SEARCH_TOKENIZER="unicode61 remove_diacritics 2"
```

### .env

```bash
# Build a feature locally
AKAN_PUBLIC_ENV=local
AKAN_PUBLIC_OPERATION_MODE=local
AKAN_PUBLIC_LOG_LEVEL=debug

# Reproduce with shared test data
AKAN_PUBLIC_ENV=debug
AKAN_PUBLIC_OPERATION_MODE=local
AKAN_PUBLIC_LOG_LEVEL=debug

# Deploy production to a cloud server
AKAN_PUBLIC_ENV=main
AKAN_PUBLIC_OPERATION_MODE=cloud
AKAN_PUBLIC_LOG_LEVEL=info

# Deploy production to an edge server
AKAN_PUBLIC_ENV=main
AKAN_PUBLIC_OPERATION_MODE=edge
AKAN_PUBLIC_LOG_LEVEL=info
```

### .env

```bash
# An edge site: one container, its SQLite files on a volume
AKAN_PUBLIC_OPERATION_MODE=edge
AKAN_DATABASE_MODE=single
AKAN_SQLITE_DIR=/data

# The same image on a cloud cluster
AKAN_PUBLIC_OPERATION_MODE=cloud
AKAN_DATABASE_MODE=cluster
POSTGRES_URL=postgres://app:…@db.internal:5432/app?max=20&ssl=require
REDIS_URI=redis://redis.internal:6379
```

### Using getEnv()

```ts
import { getEnv } from "akanjs/base";

const env = getEnv();

env.clientHttpUri; // app URL
env.serverHttpUri; // API URL
env.serverWsUri;   // WebSocket URL
```

### local

```bash
AKAN_PUBLIC_OPERATION_MODE=local
clientHttpUri=http://localhost:8282
serverHttpUri=http://localhost:8282/api
serverWsUri=ws://localhost:8282
```

### cloud / edge

```bash
AKAN_PUBLIC_APP_NAME=myapp
AKAN_PUBLIC_ENV=main
AKAN_PUBLIC_SERVE_DOMAIN=akanjs.com

serverHttpUri=https://myapp-main.mydomain.com/api
serverWsUri=wss://myapp-main.mydomain.com
```

### apps/myapp/main.ts

```ts
import { AkanApp } from "akanjs/server/akanApp";

const run = async () => {
  await new AkanApp("./server", { openapi: true }).start();
};
void run();
```

### Read the OpenAPI document

```bash
curl http://localhost:8282/openapi.json
```

### apps/myapp/main.ts

```ts
import { AkanApp } from "akanjs/server/akanApp";

const run = async () => {
  await new AkanApp("./server", { modules: ["article"] }).start();
};
void run();
```

### apps/myapp/main.ts

```ts
import { AkanApp } from "akanjs/server/akanApp";

const run = async () => {
  await new AkanApp("./server", { disableLibs: ["social"], disableModules: ["legacyImport"] }).start();
};
void run();
```

### health

```bash
curl http://localhost:8282/_akan/app/health
```

### metrics

```bash
curl http://localhost:8282/_akan/app/metrics
```

### logs

```bash
AKAN_PUBLIC_LOG_LEVEL=debug
AKAN_LOG_FILE_LEVEL=trace
AKAN_MEMORY_LOG=1
AKAN_LOG_MAX_SIZE_MB=50
AKAN_LOG_MAX_FILES=100
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

