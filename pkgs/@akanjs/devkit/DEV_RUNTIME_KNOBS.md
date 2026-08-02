# Dev runtime knobs

Every environment variable that changes how much memory a dev server is allowed to use, and how it
gives that memory back. Written for whoever sizes a sandbox: the defaults are tuned for a laptop, and a
container smaller than one needs to know which numbers move.

Nothing here is a secret — these are sizing knobs, set alongside the rest of a deployment's env.

## The budget

| variable | default | what it does |
|---|---|---|
| `AKAN_MEMORY_LIMIT` | the container's cgroup `memory.max`, if any | The total the dev server may use. Accepts a plain byte count or a suffix — `1200mb`, `2gib`. Every ceiling below is a fraction of this. |

With neither an explicit value nor a cgroup limit, each process falls back to its own dev default, which
assumes a developer laptop rather than a sandbox.

## Per-process ceilings

Each ceiling can be set outright, and otherwise takes a share of `AKAN_MEMORY_LIMIT`. A process that
crosses its ceiling is replaced when it is next idle — never mid-work.

| process | explicit (MiB) | explicit (bytes) | share of the limit | fallback with no limit |
|---|---|---|---|---|
| incremental builder | `AKAN_BUILDER_MAX_RSS_MB` | `AKAN_BUILDER_MAX_RSS` | **0.35** | 1200MB (dev) |
| RSC worker | `AKAN_RSC_WORKER_MAX_RSS_MB` | `AKAN_RSC_WORKER_MAX_RSS` | **0.55** | 768MB (dev), unbounded (production) |

`AKAN_BUILDER_MAX_RSS_MB=0` leaves the builder unbounded, which is the escape hatch for an app whose
boot build simply does not fit under the derived share.

### The shares do not add up to a budget, and that is worth knowing

0.35 + 0.55 = **0.90 of the declared limit**, and only two processes are in that sum. A dev server also
runs a dev host, a gateway, one or more backend replicas, and — during a build — a disposable build
worker whose peak is the largest transient in the tree (measured: ~548MB on a mid-size app, ~1.1GB on
this repo's own `apps/akan`). None of those has a ceiling, and none is subtracted from the two above.

In practice this holds because the two ceilings are rarely at their limit simultaneously and the build
worker exits. But if you are sizing a container to a hard number, size it against the *sum of observed
peaks*, not against these fractions. Measured floors, for reference: builder 134-202MB at rest and
~490MB after a route build, RSC worker ~142MB after boot, ~247MB per route build.

## Recycling behaviour

| variable | default | what it does |
|---|---|---|
| `AKAN_DEV_IDLE_SUSPEND_MS` | `300000` (5 min) | How long a dev server may sit unused before its builder is released entirely. The next edit or route request brings it back, at the cost of one boot build. `0` keeps the builder resident for the whole session. |
| `AKAN_RSC_WORKER_MAX_RELOADS` | `10` in dev, off in production | Reloads tolerated before the worker is recycled instead of reloaded in place. Bun's ESM registry never evicts, so each in-place reload of the pages bundle is retained. |
| `AKAN_RSC_WORKER_MIN_RECYCLE_INTERVAL_MS` | `1000` | Floor between worker recycles, so a burst of saves produces one. |
| `AKAN_RSC_WORKER_RECYCLE_GRACE_MS` | `5000` | How long a recycled worker may take to finish what it is holding. |
| `AKAN_RSC_WORKER_MAX_RENDER_COUNT` | unset | Recycle after this many renders. Off by default; a blunt instrument for chasing a leak. |
| `AKAN_RSC_WORKER_MAX_ROUTE_MODULES` | unset | Recycle once this many route modules are loaded. Same. |

The builder's own recycle timing is not configurable and is stated here because it is what a tight
ceiling costs: it waits **750ms** of quiet so a recycle never lands mid-burst, then re-reads the
process's RSS after **20s** (unless it is already 1.5× over) to see whether the allocator gave the
memory back on its own, and never recycles twice inside **30s**. Requests that arrive while the builder
is away are held — up to **64** of them — and replayed when it is back, rather than failed.

If the builder crosses the ceiling again within that 30s window, the dev host says so once and keeps
enforcing the ceiling. It stops enforcing only when a *freshly replaced* builder is already over it,
which is the one case where replacing it again cannot help; it says that too, and names this knob.

## Build behaviour

| variable | default | what it does |
|---|---|---|
| `AKAN_DEV_CSR_REBUILD` | off | Rebuild the CSR artifact on every save. Armed automatically by the first `/__csr` or `?csr=true` request, which is what a mobile WebView session does — set it explicitly only to have it from boot. |
| `AKAN_BUILDER_RPC_TIMEOUT_MS` | `120000` | How long the backend waits for a builder answer. Generous on purpose: a cold CSR build of every page legitimately takes tens of seconds. |
| `AKAN_SERVER_PAGES_SPLITTING` | off | Emit the server pages bundle as chunks instead of one file. Experimental — the memory/latency trade has not been measured on a real app. |

## Observability

| variable | default | what it does |
|---|---|---|
| `AKAN_MEMORY_LOG` | off | `=1` logs a periodic memory report from each server role. |
| `AKAN_MEMORY_LOG_INTERVAL_MS` | `60000` | How often that report is written. |
| `AKAN_MEMORY_GC_ON_REPORT` | off | `=1` forces a GC before each report, so the number is retained memory rather than garbage. Costs a full GC per report. |

## Sizing a small sandbox

A worked example, for a 1.2GB container:

```bash
AKAN_MEMORY_LIMIT=1200mb          # builder gets ~420MB, rsc worker ~660MB
AKAN_DEV_IDLE_SUSPEND_MS=300000   # release the builder after 5 idle minutes
```

Two things to expect at that size. The builder crosses 420MB during ordinary work — one route build
costs ~247MB on top of its floor — so it is replaced roughly once per 30s while you keep building, each
replacement costing a boot build that requests wait through rather than fail. And the build worker's
peak is not covered by any of these ceilings; if the kernel OOM-kills it, the dev server survives with a
red build for that generation and the log names the signal.

Raising `AKAN_BUILDER_MAX_RSS_MB` above the derived share trades memory for fewer boot builds. Setting
it to `0` trades the bound away entirely, which on a container this size means the kernel decides
instead.
