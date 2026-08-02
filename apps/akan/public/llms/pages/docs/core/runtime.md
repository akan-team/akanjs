# Akan Runtime

- Source: /docs/core/runtime
- Mirror: /llms/pages/docs/core/runtime.md
- Section: docs
- Category: Core Concepts
- Priority: P0

## Headings

- Akan Runtime (#akan-runtime)
- Root-level Env Variables (#dev-prod)
- getEnv() (#get-env)
- OpenAPI JSON (#openapi-json)
- Health, Metrics, Logs (#health-metrics-logs)

## Content

Akan Runtime

Akan applications run on a Bun-based runtime that connects app code, generated artifacts, server routes, and pages. The app entry point (main.ts) starts the runtime, and Akan handles the server shape behind it.

When Akan App starts, Akan Server prepares everything the app can serve. In practice, the runtime exposes four kinds of work.

Internal API (Queue, Timer, etc.): internal work that runs without a browser request.

API (HTTP, WebSocket): public communication for data requests and realtime updates.

SSR Pages (Web): web pages rendered by the server and sent to the browser.

CSR Page (Android, iOS): client-rendered pages used by mobile targets.

One Akan App can run one or more Akan Server processes. AKAN_REPLICA controls how many server processes are started for each role, so the same app can scale web traffic and background work separately. For browser traffic, Akan App also load-balances requests across ready federation and all servers.

federation: serves browser traffic such as pages, API calls, and WebSocket connections.

batch: runs background work such as queues, timers, and scheduled jobs.

all: runs both federation and batch behavior in one server process. This is the simple local default.

A single Akan App has built-in clustering. You can run multiple server replicas and let Akan App distribute traffic, without setting up separate local load-balancing tools such as nginx, docker compose, or pm2.

Root-level Env Variables

The root .env file decides which organization, domain, environment, operation mode, and log level the app uses while it runs. Most projects keep these values stable, but changing them lets the same app behave like a local, debug, develop, or production-like service.

Environment variables prefixed with AKAN_PUBLIC_ are public. They can be read by browser code, so never store secrets, private tokens, or credentials in them.

Project owner

Organization or repository namespace. Usually fixed for the project.

Public domain

Used when the app creates links, callbacks, and domain-based routes.

Data environment

Choose local, debug, develop, or main depending on which data set you want to use.

Connection target

Choose whether clients connect to local runtime, edge paths, or cloud services.

Log detail

Choose how much runtime output you want to see in the terminal.

Text search index

Unset means on. Set 0 to switch the full-text index off; indexed data is kept and re-enabling reconciles every model. Give every process in a deployment the same value, because a process cannot clean up triggers for models it does not mount.

Search tokenizer

The fts5 tokenizer the index is built with. Defaults to unicode61 remove_diacritics 2. Changing it rebuilds the index from the mirror on the next boot, so no data is re-read from the model tables. The rebuild takes no cross-process claim, so a fleet restarted at once repeats it in every process; stagger the restart when the mirror is large. database.search.tokenizer in the app config takes precedence. A value this SQLite build cannot provide fails the boot and names the fix, rather than starting a server whose every search would raise. That boot failure leaves writes alone: the index is dropped but nothing else is, so the models on that database keep accepting writes and the next healthy boot recovers the index in full.

File log detail

Choose how much structured Logger output is written to files. Defaults to trace, independent from terminal log level.

File logging

AkanApp writes gateway and child process logs to runtime/logs by default. Set this to 0 to disable file logging.

Log directory

Override the default runtime/logs directory used by file logging.

Log rotation size

Create the next sequence file when a process log reaches this size.

Log retention

Keep this many rotated files per process key, such as gateway or child-0.

AKAN_PUBLIC_ENV modes

My machine, my test data.

Shared test data for reproduction.

Team integration checks.

Production-like behavior.

AKAN_PUBLIC_OPERATION_MODE modes

Client talks to local runtime.

Client talks to cloud services.

Client uses edge-facing paths.

Common setup scenarios

Build a feature locally

Reproduce with shared test data

Deploy production to cloud server

Deploy production to edge server

A common setup is ENV=local and OPERATION_MODE=local while building features, then switching ENV to debug or develop when you need to test with shared data or shared services.

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

Health, Metrics, Logs

Akan runtime exposes simple ways to check whether the app is alive, how busy it is, and what it is doing. In local development, these are mostly useful when a page does not load or a background job seems stuck.

Health

Use this to check whether the gateway and server processes are running and ready.

Metrics

Use this to see runtime counts such as active requests, WebSocket connections, rooms, and process metrics.

Logs

Use AKAN_PUBLIC_LOG_LEVEL to choose how much detail appears in the terminal. AkanApp also stores gateway and child process output in runtime/logs by default, using AKAN_LOG_FILE_LEVEL for structured Logger output and rotating files by date and size.

File names include app name, environment, operation mode, local date, process key, and sequence. Direct console.log calls from child servers are captured through stdout/stderr pipes; direct gateway console.log calls are not part of Logger sink capture.

Start with health when the app does not respond. Use metrics when the app responds but feels busy. Increase LOG_LEVEL or enable AKAN_MEMORY_LOG when you need more terminal detail.

## Code Examples

### apps/myapp/main.ts

```ts
import { AkanApp } from "akanjs/server";

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

### Code

```bash
AKAN_PUBLIC_ENV=local
AKAN_PUBLIC_OPERATION_MODE=local
AKAN_PUBLIC_LOG_LEVEL=debug
```

### Code

```bash
AKAN_PUBLIC_ENV=debug
AKAN_PUBLIC_OPERATION_MODE=local
AKAN_PUBLIC_LOG_LEVEL=debug
```

### Code

```bash
AKAN_PUBLIC_ENV=main
AKAN_PUBLIC_OPERATION_MODE=cloud
AKAN_PUBLIC_LOG_LEVEL=info
```

### Code

```bash
AKAN_PUBLIC_ENV=main
AKAN_PUBLIC_OPERATION_MODE=edge
AKAN_PUBLIC_LOG_LEVEL=info
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
import { AkanApp } from "akanjs/server";

const run = async () => {
  await new AkanApp("./server", { openapi: true }).start();
};
void run();
```

### Read the OpenAPI document

```bash
curl http://localhost:8282/openapi.json
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

