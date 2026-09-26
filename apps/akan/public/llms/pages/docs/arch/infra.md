# Runtime And Infra

- Source: /docs/arch/infra
- Mirror: /llms/pages/docs/arch/infra.md
- Section: docs
- Category: Architecture
- Priority: P0

## Headings

- Infra Architecture (#infra-overview)
- Which Option Should I Use? (#choose-option)
- How Traffic Moves (#traffic-flow)
- Database Mode (#database-mode)
- Growth Stages (#growth-stage)

## Content

Runtime And Infra

Your own machine, for fast iteration: MVP screens, feature prototypes and debugging.

A Kubernetes runtime for shared team environments and production-like workloads.

The deployment control area: CI/CD, environment files, secrets and release automation.

The app packaged with everything it needs, so it starts the same way on any server.

Kubernetes's unit of running: one or more containers placed together on one server (a node).

The cluster's front door. It takes outside traffic for a domain and routes it inward.

A stable address inside the cluster that forwards to whichever pods run the app.

A Helm package of Kubernetes manifests. The one Akan ships lives in infra/app.

A Kubernetes object that hands private values, such as database URLs, to pods as env vars.

Volume access modes: one node mounts the first, pods on many nodes share the second.

SQLite's write-ahead log mode, which lets reads keep going while a write is in progress.

MVP or feature prototype

Local

Use local development first. Keep the setup small until the product needs shared data, shared testing, or deployment automation.

Team QA or staging

Cloud · debug / develop

Use cloud deployment with debug or develop environments so the team can test the same service together.

Production service

Cloud · main

Use the main branch of the same cloud deployment. The chart runs one pod in single mode; before traffic outgrows it, move that branch to cluster mode with your own Postgres and Redis.

An SSR or CSR page response for browser users.

A business operation, run through signal and service logic.

Realtime updates over a client connection that stays open.

Static files, client bundles, images and generated output, served as files.

Mode

Database

Where it runs

Cache · queue · pubsub

One SQLite file

SQLite files: a key-value cache, and a queue and pubsub sped up by Bun IPC

One container

One SQLite file (WAL) on a host volume that every container opens

Several containers on one host

Several servers

The best start for MVPs, internal tools, admin pages, content sites and small-to-medium services.

Enough for most products under roughly 10k DAU, especially with WAL mode.

When one host runs several containers that need a shared cache, pub/sub and queue.

Lighter than cluster: cache and background work move to Redis, the data stays in one SQLite file.

For several servers, local runs that match production, or heavier relational storage.

The most production-like mode, for heavier concurrent work and cluster validation.

Stable

Experimental

Stage

Servers

Containers

Database mode

1. Single server

one

2. Multiple containers

several

3. Cloud cluster

Infra Architecture

The business code you write is the same wherever it runs. What changes between a laptop and a cloud is everything around it: where traffic enters, where the app runs, and how data and deployments are managed. That surrounding layer is what this page calls infrastructure.

Akan apps run on a developer machine or in a cloud cluster, and the same application code is packaged for both. The infrastructure falls into three areas:

Area

Infrastructure shape

A developer ships through the master infra — CI/CD, environment files and secrets — into a cloud cluster, where the Akan app runtime serves users and their devices.

Words used on this page

Term

Which Option Should I Use?

Start from the product situation, not from the infrastructure name. A small internal tool, a team QA environment and a production service need different levels of infrastructure, so start from the one that describes where you are today:

How Traffic Moves

Infrastructure does not change the business code inside your app. It decides how a request reaches the Akan runtime. The path is simple on your laptop and goes through a structured layer in a cloud cluster.

Request paths

Browser Or Device

Domain Or Local Address

Local Dev Server

Cloud Ingress

Kubernetes Service

Akan App Runtime

Page · API · WebSocket · Asset

Local path

A developer opens localhost and talks almost directly to the Akan dev runtime. This is the fastest path for building screens and checking business flows.

Cloud path

A user enters through a public domain. Kubernetes Ingress receives the request, Service finds the right app pod, and the Akan runtime handles the actual page or API response.

Once a request reaches the Akan App Runtime, the runtime sorts it by kind of work. Each kind gets its own kind of answer:

Request

Database Mode

Besides the app itself, a service needs somewhere to keep data, a queue for background work and a cache. The database mode decides which engine fills each of those three roles.

Start with single mode. Most services do not need a separate database cluster on day one. When real performance limits, queue needs or multi-instance operation appear, move up to multiple or cluster mode without changing the business shape of the app.

When to pick each mode

When → what you get

Declaring the modes

Local services

Deploying multiple: docker compose on one host

Deploying cluster: the Kubernetes chart

Uploaded files

A deployed multiple or cluster app runs several instances, and each must read the files the others wrote. Keep uploads in one of two places:

Outside development, an upload to a local disk that only one instance can read is refused.

Moving data between modes

The SQL console on cluster

Growth Stages

Infrastructure does not need to start big. A business can begin with one server and one container, then grow step by step as traffic and reliability requirements increase. The three stages at a glance:

Stage 1 is stable, and stages 2 and 3 are experimental. Both have a recipe under Database Mode above: docker compose on one host for stage 2, the chart's cluster mode for stage 3.

A small product, MVP, internal tool or early admin page runs on one server with one Akan container. That single container serves the database, API, web, CSR, image optimization, cache and queue, and single database mode is usually enough.

The chart asks a debug or develop pod for 0.05 CPU and 250M, capped at 0.5 CPU and 1G.

Users reach one server that holds one Akan runtime container, and SQLite WAL storage, the local cache and the local queue all live inside that container.

2. Single server, multiple containers

When traffic grows but one machine is still enough, run multiple containers on the same server. This is vertical scaling: a stronger server, more containers, and multiple or cluster database mode.

Users pass a reverse proxy into one large server running Akan runtime containers A, B and C, and every container shares one Redis for cache, pubsub and queue plus one database on the same server: a SQLite file every container opens, or Postgres.

3. Cloud cluster scale

When one server is no longer enough, move to a cloud cluster. Multiple servers run multiple containers, and cluster mode keeps the database/cache layer closer to production operation.

Inside a cloud cluster, users enter through a Kubernetes Ingress and Service that fan out to cloud nodes A, B and C, each running one Akan runtime pod against one shared Redis and one Postgres database.

## Code Examples

### apps/myapp/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  database: { modes: ["single", "cluster"] },
};

export default config;
```

### Terminal

```bash
akan dbup                  # every mode the workspace's apps declare
akan dbup --mode multiple  # Redis
akan dbup --mode cluster   # Redis and Postgres 18
```

### docker-compose.yaml

```yaml
services:
  redis:
    image: redis:8
  app:
    image: <registry>/<repo>/<app>:<tag>
    deploy:
      replicas: 3
    environment:
      AKAN_DATABASE_MODE: multiple
      REDIS_URI: redis://redis:6379
      SQLITE_DATABASE_PATH: /data/app.db
      AKAN_STORAGE_SHARED: "true"
    volumes:
      - app-data:/data
      - app-files:/workspace/local
volumes:
  app-data:
  app-files:
```

### infra/app/values/myapp-values.yaml

```yaml
main:
  database:
    mode: cluster # single (default) or cluster
    # A Secret holding POSTGRES_URL, REDIS_URI and, optionally,
    # POSTGRES_INSIGHT_URL
    secretName: app-database
  app:
    pods: 3 # cluster only; default 2
  storage:
    # Optional: a ReadWriteMany claim mounted at /workspace/local
    sharedClaim: uploads
```

### Terminal

```bash
akan db-export myapp
AKAN_DATABASE_MODE=cluster POSTGRES_URL=postgres://… REDIS_URI=redis://… \
  akan db-import myapp
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

