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
| incremental builder | `AKAN_BUILDER_MAX_RSS_MB` | `AKAN_BUILDER_MAX_RSS` | **0.35** | 2048MB (dev) |
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
peaks*, not against these fractions. Measured on `apps/minimal` (macOS, 2026-09-29), for reference: the
builder ~120MB at rest after boot, ~540MB right after its first route build (the bundler hands most of it
back after ~20s idle), ~250MB while it patches saves into the SSR registry; the RSC worker ~75MB after boot
and ~110MB after route builds; the build worker ~900MB for the SSR registry's boot build.

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
| `AKAN_DEV_CSR_REBUILD` | off | Rebuild the CSR artifact on every save. Armed automatically by the first `/__csr` or `?csr=true` request, which is what a mobile WebView session does — set it explicitly only to have it from boot. Set at boot, its CSR build runs beside the SSR registry's: on apps/akan the builder and its workers peak at about 2.7GB instead of 1.3GB, and the next boot wave waits for both builds. |
| `AKAN_DEV_CSR` | `registry` | How the dev CSR page is built. `registry` serves it as a module registry that patches the modules a save changed; `artifact` brings back the single-file bundle, which reloads on every save. |
| `AKAN_DEV_CSR_PATCHER` | on | `off` sends every save of a dev module registry — the CSR page's, and the one SSR pages load their client code from (`.akan/artifact/ssr-dev`) — to a disposable build worker instead of patching it in the resident builder. The patcher keeps each registry in memory (on minimal the CSR one adds about 170MB to the builder's median RSS and 210MB to its peak, flat across saves) and hands whole-app builds to a worker: a first build, a new npm module, a bare import no file of its package resolved before, a config change, a signal or dictionary save (their metadata is inlined at build time), and a registry whose last whole build was cut short. A misspelled import fails in the builder, like a missing file. A builder that dies mid-patch turns it off until the dev server next replaces its builder and backend together (a config, signal or dictionary change). |
| `AKAN_DEV_WATCH_DEBOUNCE_MS` | `30` | How long the file watcher collects changes before it hands a batch over. Every save waits this long before anything builds. A second write inside the window joins the same batch; one after it starts another batch, which reads the file's latest content, so a format-on-save costs a second build rather than a wrong one. |
| `AKAN_BUILDER_RPC_TIMEOUT_MS` | `120000` | How long the backend waits for a builder answer. Generous on purpose: a cold CSR build of every page legitimately takes tens of seconds. |
| `AKAN_SERVER_PAGES_SPLITTING` | off | Emit the server pages bundle as chunks instead of one file. Experimental — the memory/latency trade has not been measured on a real app. |

Two more are read by the dev server for its end-to-end tests only; never set them. `AKAN_DEV_SSR_ARM_DELAY_MS`
holds the SSR registry's boot build back, and `AKAN_CSR_DEV_APP_WRITE_DELAY_MS` holds a registry's `app.js`
back after a patch is announced.

## Observability

| variable | default | what it does |
|---|---|---|
| `AKAN_MEMORY_LOG` | off | `=1` logs a periodic memory report from each server role. |
| `AKAN_MEMORY_LOG_INTERVAL_MS` | `60000` | How often that report is written. |
| `AKAN_MEMORY_GC_ON_REPORT` | off | `=1` forces a GC before each report, so the number is retained memory rather than garbage. Costs a full GC per report. |

## Several apps at once

`akan start a,b` runs one dev host per app under a supervisor, so **every number above multiplies by the number
of apps** — there is no shared builder and no shared RSC worker. Measured on this repo 8 seconds after both apps
finished booting:

| process | akan | minimal |
|---|---|---|
| dev host | 279MB | 196MB |
| incremental builder | 182MB | 114MB |
| backend (gateway and replica) | 123MB | 130MB |
| RSC worker | 162MB | 75MB |

Plus ~75MB for the supervisor itself: **~1.3GB for two apps at rest.** The peak is the boot, not the rest: the
build workers — the base build, then the SSR registry's — take a whole akan dev host to ~1.9GB and minimal's to
~1.4GB, and booted one after the other the two peaked at 2.2GB. The builders are also the part that goes away —
`AKAN_DEV_IDLE_SUSPEND_MS` releases each one independently, so a session where you are editing one app keeps one
builder, and every idle app keeps only its dev host, backend and RSC worker. **Multi-app is sized against idle
suspend being on**; setting it to `0` keeps every builder resident for the whole session.

Two things bound the peak rather than the floor:

- **`--concurrency` (default: what the machine allows).** Apps boot in waves. The next wave starts once each
  app of the previous one serves and its builder's boot builds have settled — the SSR registry's, and CSR's when
  `AKAN_DEV_CSR_REBUILD=1` arms it — since those workers are the largest processes of a boot. An app that never
  reports them starts the next wave 30 seconds after it serves. It shows as ready, and `--open` opens it, as
  soon as it serves. Booting `n` apps at once means `n` overlapping peaks — which is what OOM-kills a container
  that would have been fine with them staggered. Unset, the wave is
  `min(apps, half the memory budget / 1.8GB per app, cores / 4)`, never below one, and the session prints
  which — so a laptop boots its apps together and a small container boots them one at a time. The 1.8GB is
  apps/akan's boot peak across all its processes (measured 1.73–1.9GB). The memory budget is the smaller of
  the host's RAM and `AKAN_MEMORY_LIMIT` / the cgroup limit; `os.freemem()` is not consulted, because it counts
  free pages rather than reclaimable ones and reports ~0.3GB on an idle 48GB laptop.
- **`AKAN_MEMORY_LIMIT` is per process, not per session.** Each dev host derives its builder and RSC-worker
  ceilings from it independently, so a limit sized for one app does not become a budget for four. Divide it
  yourself, or leave it unset on a laptop. The one place it is read as a session ceiling is the boot wave
  above, and only downward: a session cannot outgrow the container it runs in, whatever each process inside
  it was told it may take.

## Sizing a small sandbox

A worked example, for a 1.2GB container running an app the size of `apps/minimal` (apps/akan's boot alone
peaks near 1.8GB):

```bash
AKAN_MEMORY_LIMIT=1200mb          # builder gets ~420MB, rsc worker ~660MB
AKAN_DEV_IDLE_SUSPEND_MS=300000   # release the builder after 5 idle minutes
```

Two things to expect at that size. The builder crosses 420MB during ordinary work — its first route
build alone takes it to ~540MB — so it is replaced roughly once per 30s while you keep building, each
replacement costing a boot build that requests wait through rather than fail. And the build worker's
peak is not covered by any of these ceilings; if the kernel OOM-kills it, the dev server survives with a
red build for that generation and the log names the signal. On a boot whose `.akan` was cleared, the SSR
registry's first build is such a worker, peaking near 900MB on `apps/minimal`: a killed one leaves no
registry, and every later save retries that same whole build, so a container that cannot fit it once
cannot fit it at all.

Raising `AKAN_BUILDER_MAX_RSS_MB` above the derived share trades memory for fewer boot builds. Setting
it to `0` trades the bound away entirely, which on a container this size means the kernel decides
instead.
