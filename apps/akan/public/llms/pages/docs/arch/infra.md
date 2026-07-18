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

Infra Architecture

Akan apps can run locally, in a cloud cluster, or near users and devices through edge servers. The same application code can be packaged for different environments, while infrastructure decides where traffic enters, where services run, and how data or deployment operations are managed.

Developer machine for fast iteration. Good for MVP screens, feature prototypes, and local debugging.

Kubernetes-based runtime for shared team environments and production-like workloads.

Near-site server for stores, kiosks, robots, factories, buildings, or local device networks.

Deployment control area for CI/CD, environment files, secrets, and release automation.

Which Option Should I Use?

Start from the product situation, not from the infrastructure name. A small internal tool, a team QA environment, a store kiosk, and a production service need different levels of infrastructure.

MVP or feature prototype

Use local development first. Keep the setup small until the product needs shared data, shared testing, or deployment automation.

Team QA or staging

Use cloud deployment with debug or develop environments so the team can test the same service together.

Physical site or device network

Use edge when the service is close to stores, kiosks, factories, buildings, robots, or private device networks.

Headquarters plus branches

Use a hybrid shape: cloud cluster as the main service and edge servers for nearby execution, proxying, or cache-like responsibilities.

How Traffic Moves

Infrastructure does not change the business code inside your app. It decides how a request reaches the Akan runtime. The path is simple on your laptop, more structured in a cloud cluster, and sometimes site-specific when edge servers are involved.

Local path

A developer opens localhost and talks almost directly to the Akan dev runtime. This is the fastest path for building screens and checking business flows.

Cloud path

A user enters through a public domain. Kubernetes Ingress receives the request, Service finds the right app pod, and the Akan runtime handles the actual page or API response.

Edge path

A store, kiosk, robot, or local device network can reach an edge proxy first. The edge side may serve nearby runtime work or forward traffic to the cloud service.

After the request reaches Akan App Runtime, the runtime classifies what kind of work it is. A page request renders a web page, an API request runs signal/service logic, a WebSocket request keeps a realtime channel open, and static assets are served as files.

SSR or CSR page response for browser users.

Business operations through signal and service logic.

Realtime updates and long-lived client connections.

Static files, client bundles, images, and generated output.

Key idea: infrastructure chooses the route into the app, not the business behavior inside the app. Local, cloud, and edge paths can look different, but they all eventually hand work to the Akan runtime.

Database Mode

Start with single mode first. Most services do not need a separate database cluster on day one. When real performance limits, queue needs, or multi-instance operation appear, you can move up to multiple or cluster mode without changing the business shape of the app.

SQLite is the default database in single mode, but that does not mean it is only for toys. With WAL mode, SQLite has very strong practical performance. For many ordinary services under about 10,000 DAU, single mode is usually enough until real usage data proves otherwise.

Best starting point for MVPs, early internal tools, admin screens, content sites, and many small-to-medium services.

SQLite based, Bun IPC accelerated processing

SQLite based key-value cache

High enough for most products under roughly 10k DAU, especially with WAL mode.

Use this when the product starts needing a separated cache, pub/sub, queue-like behavior, or more realistic local service boundaries.

Better separation for cache and background work while staying lighter than full cluster-style storage.

Use this when the team wants local behavior to resemble a production cluster before release or when heavier relational persistence is needed.

Most production-like local mode. Better for heavier concurrent workloads and cluster-oriented validation.

Database

Queue / PubSub

Cache

Performance

A practical rule: do not upgrade database mode because it feels safer. Stay on single until you see real needs such as Redis-backed pub/sub, separate queue/cache behavior, heavier concurrent writes, or a deployment shape that must resemble production.

Growth Stages

Infrastructure does not need to start big. A business can begin with one server and one container, then grow step by step as traffic, reliability requirements, and physical site needs increase.

1. Single server

A small product, MVP, internal tool, or early admin page can run as a single server with a single Akan container. single database mode is usually enough.

Akan runtime's single container uses about 0.05 CPU/200MB RAM at boot, and about 0.5 CPU/0.5GB RAM in use. It handles all database, api server, web server, CSR page, image optimization, cache, queue, etc., isn't it amazing?

2. Single server, multiple containers

When traffic grows but one machine is still enough, run multiple containers on the same server. This is vertical scaling: stronger server, more containers, and multiple or cluster database mode.

Akan Runtime runs multiple child servers based on the AKAN_REPLICA environment variable setting to perform load balancing. There is no need to run multiple runtimes for load balancing purposes, and if stability improvement is needed, multiple runtimes can be run.

3. Cloud cluster scale

When one server is no longer enough, move to a cloud cluster. Multiple servers run multiple containers, and cluster mode keeps the database/cache layer closer to production operation.

4. Cloud plus distributed edge

Very large services can keep the cloud cluster from stage 3 and add edge servers below it. Each edge server has its own Akan runtime and local database, so stores, factories, robots, or local networks can compute and store nearby data like a distributed cache layer.

The practical rule is to grow only when the business asks for it. Start small, measure real usage, then move from single server to multi-container, cloud cluster, and finally cloud plus edge.

## Code Examples

### akan.config.ts

```ts
const config: AppConfig = {
  defaultDatabaseMode: "single",
};
```

### Local database commands

```bash
akan dbup --mode multiple
akan dbup --mode cluster
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

