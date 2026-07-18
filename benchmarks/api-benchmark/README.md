# akanjs performance benchmarks

A pragmatic toolkit to (1) show akanjs measures at a reasonable level against mainstream
frameworks and (2) trace internal hotspots to drive performance improvements.

This is **not** a rigorous "we are the fastest" proof. The goal is a defensible narrative:
_"we measured these surfaces with a controlled methodology, and the numbers are competitive
with widely-used frameworks"_ — plus an internal tracing loop for ongoing tuning.

## What gets measured

Seven surfaces, two deployment modes (`single` = SQLite, `cluster` = Postgres + Redis + BullMQ):

| Surface | Scenarios | Compared against |
| --- | --- | --- |
| Pure HTTP / no-DB | `pure_http_no_db` gateway/runtime ping | raw `Bun.serve`, Elysia, Hono, Fastify (node) |
| Signal API / no-DB | `signal_no_db` normal Signal query, no DB | akanjs single/cluster |
| REST | ping (minimal), find/create (realistic) | raw `Bun.serve`, Elysia, Hono, Fastify (node) |
| DB | find-one, list, relation (DataLoader) | raw `bun:sqlite`; Prisma / Drizzle (optional, see below) |
| WebSocket | 1 publisher → N subscribers fan-out + connection scaling | raw Bun WS (and the akan `/api/ws` pubsub) |
| SSR/RSC | TTFB, render throughput | Next.js (manual target; maturity-caveated) |
| Full-stack | login → list → create → read | Next.js + Prisma (manual target) |

Plus process-level: cold start, idle RSS, event-loop lag, GC duration, soak memory.

### Two axes (fair comparison)

akanjs always runs JWT verify + guards + document store + schema serialization. Comparing
that to a competitor's bare "hello world" is unfair, so every comparison is run on two axes:

1. **Minimal** — bare ping/echo. For akanjs, use `pure_http_no_db` and `signal_no_db` to separate gateway/runtime overhead from Signal overhead.
2. **Realistic** — JWT verify + one DB read + response serialization, applied identically
   to every competitor (see `competitors/shared/jwt.ts`). This is the apples-to-apples row.

### Runtime caveat

Elysia, Hono, raw Bun, raw sqlite and akanjs run on **Bun**; Fastify and Next.js run on
**Node**. We deliberately do not try to run Node frameworks on Bun. Cross-runtime rows are
labelled `(node)` and reports note that the gap partly reflects the runtime, not the framework.

### Gateway proxy isolation

akanjs serves through a gateway (`AkanApp` :8282) that proxies to worker processes
(`AkanServer`). Competitors are single-process. The harness records the gateway-observed
proxy-hop time (exposed at `/_akan/app/metrics` as `proxyHop`) so the pure proxy overhead can
be separated from handler time (which comes from the request trace).

## Prerequisites

- [Bun](https://bun.sh) (already required by this repo)
- [k6](https://k6.io/docs/get-started/installation/) for HTTP/WS load generation
- Node 22+ (only for the Fastify competitor; uses `--experimental-strip-types`)
- Install competitor deps: `cd benchmarks/api-benchmark && bun install`

Run the load generator on a separate machine/core set from the server when possible; on
macOS raise `ulimit -n` before high-connection WebSocket runs.

## Quick start

```bash
cd benchmarks/api-benchmark
bun install

# 1. Compare pure HTTP/runtime overhead across Bun-native competitors
bun harness/run.ts --target raw-bun  --suite pure_http --vus 100 --duration 60s
bun harness/run.ts --target elysia   --suite pure_http --vus 100 --duration 60s
bun harness/run.ts --target hono     --suite pure_http --vus 100 --duration 60s
bun harness/run.ts --target fastify  --suite pure_http --vus 100 --duration 60s

# 2. akanjs no-DB tracks. These do not log in or seed data.
bun harness/run.ts --target akan-single --suite pure_http,signal --vus 100 --duration 60s

# 3. akanjs DB tracks — the harness auto-logs in as root admin and seeds the dataset first.
#    Tracing OFF here keeps comparison numbers clean (observer effect).
bun harness/run.ts --target akan-single --suite db --vus 100 --duration 60s

# Run one scenario in isolation when tuning an SLO miss.
bun harness/run.ts --target akan-single --suite db --scenario db_list --vus 100 --duration 60s

# 4. Production cold start / idle footprint
(cd ../.. && bun run akan build minimal)
bun harness/coldstart.ts --target akan-built-single --iterations 5

# 5. Process stability soak (local reliability profile)
bun harness/run.ts --target akan-built-single --suite signal --scenario signal_no_db --vus 50 --duration 30m --soak --sample-interval 5000 --soak-warmup-window 5m

# 6. WebSocket fan-out (local 1k baseline; Akan.js 2.2.12 target)
bun harness/run.ts --target akan-single --suite websocket --vus 1000 --duration 60s --msg-per-sec 50
bun harness/run.ts --target raw-bun     --suite websocket --vus 1000 --duration 60s --msg-per-sec 50

# 7. Generate the report (comparison matrix + tracing hotspots + backlog)
bun report/generate.ts <runId>
```

`<runId>` is printed at the end of each run and is the `results/<runId>/` folder name.

## Cold start, idle memory, and soak

The process-stability track is about operational reliability rather than peak RPS. It records:

- cold start ready time p50/p95 using `/_akan/app/health` for akanjs targets;
- idle RSS after a configurable settle window;
- soak RSS time series, RSS growth MB/hour, event-loop lag p99, GC duration p99, worker restart count and RSC worker recycle/restart count.

### Dev start vs production runtime

Use `akan-single` only for local development start profiling. It runs `bun run akan start minimal`,
so CLI bootstrap and app preparation are included in the measured time.

Use `akan-built-single` for publishable cold start and soak numbers. It assumes `dist/apps/minimal/main.js`
already exists, starts that production artifact with `bun main.js`, and measures only process spawn
to ready health. Build time is intentionally excluded.

Fast smoke run:

```bash
cd benchmarks/api-benchmark
(cd ../.. && bun run akan build minimal)
RUN_ID="$(date -u +%Y-%m-%dT%H-%M-%S-prod-smoke)"
bun harness/coldstart.ts --target akan-built-single --iterations 2 --settle 3000 --run-id "$RUN_ID"
bun harness/run.ts --target akan-built-single --suite signal --scenario signal_no_db --vus 5 --duration 30s --soak --sample-interval 1000 --soak-warmup-window 5s --run-id "$RUN_ID"
bun report/generate.ts "$RUN_ID"
```

Publishable local soak baseline:

```bash
cd benchmarks/api-benchmark
(cd ../.. && bun run akan build minimal)
RUN_ID="$(date -u +%Y-%m-%dT%H-%M-%S-soak)"
bun harness/coldstart.ts --target akan-built-single --iterations 10 --settle 60000 --run-id "$RUN_ID"
bun harness/run.ts --target akan-built-single --suite signal --scenario signal_no_db --vus 50 --duration 30m --soak --sample-interval 5000 --soak-warmup-window 5m --run-id "$RUN_ID"
bun report/generate.ts "$RUN_ID"
```

### Production comparison run

Built competitor targets use prebuilt JS artifacts under `dist/competitors/<target>/server.js`,
so cold start excludes the TypeScript loader. This mirrors `akan-built-single`, which starts
the prebuilt `dist/apps/minimal/main.js` artifact.

Targets included in the production comparison set:

- `akan-built-single` — built Akan minimal app, Bun gateway + worker.
- `raw-bun-built` — raw `Bun.serve` artifact.
- `elysia-built` — Elysia artifact on Bun.
- `hono-built` — Hono artifact on Bun.
- `raw-sqlite-built` — raw `bun:sqlite` artifact on Bun.
- `fastify-built` — Fastify artifact on Node.

Fast smoke:

```bash
cd benchmarks/api-benchmark
bun run build:all-production
RUN_ID="$(date -u +%Y-%m-%dT%H-%M-%S-prod-compare-smoke)"
for target in akan-built-single raw-bun-built elysia-built hono-built fastify-built; do
  bun harness/coldstart.ts --target "$target" --iterations 2 --settle 3000 --run-id "$RUN_ID"
  bun harness/run.ts --target "$target" --suite pure_http --scenario pure_http_no_db --vus 5 --duration 10s --warmup 1s --soak --sample-interval 1000 --soak-warmup-window 3s --run-id "$RUN_ID"
done
bun report/generate.ts "$RUN_ID"
```

Publishable local comparison baseline:

```bash
cd benchmarks/api-benchmark
bun run compare:production:30m
```

The wrapper script prints the generated `RUN_ID` and final report path. Override defaults with
environment variables when needed:

```bash
cd benchmarks/api-benchmark
RUN_ID=local-prod-compare TARGETS="akan-built-single raw-bun-built elysia-built hono-built fastify-built" bun run compare:production:30m
SKIP_BUILD=1 DURATION=10m VUS=25 bun run compare:production:30m
DRY_RUN=1 bun run compare:production:30m
```

`--sample-interval` defaults to `5000` in soak mode to keep long-run JSON files manageable.
Use `--sample-interval 1000` when investigating a short regression. RSS growth is calculated
after `--soak-warmup-window` (default `5m`) so cache and server warmup do not look like a leak.

Interpret local soak numbers with machine caveats: keep background jobs quiet, avoid mixing
different hardware in the same baseline, and treat `akan-cluster` separately because worker
counts and external infra change the memory profile.
Competitor targets do not expose Akan's internal metrics endpoint, so event-loop lag, GC
duration and worker restart columns are expected to show `—` unless those servers are
instrumented in a later pass.

## WebSocket fan-out

The WebSocket surface measures `1 publisher -> N subscribers` fan-out using the same
frame shape for akanjs and raw Bun:

```json
{
  "subscribe": { "key": "benchFanout", "data": ["bench-room"], "subscribe": true },
  "publish": { "key": "benchPublish", "data": ["bench-room", 1, 1710000000000] }
}
```

For akanjs, the built-in target uses the `minimal` app's benchmark-only Signal endpoints
on `/api/ws`. For raw Bun, `/ws` implements the same `sub`/`pub` response shape so the
k6 script can compare the pubsub layer overhead against a native Bun baseline.

Local baseline runs:

```bash
cd benchmarks/api-benchmark
bun harness/run.ts --target akan-single --suite websocket --vus 1000 --duration 60s --msg-per-sec 50
bun harness/run.ts --target raw-bun     --suite websocket --vus 1000 --duration 60s --msg-per-sec 50
```

High-connection local stress runs should raise the file descriptor limit first and should
be labelled separately from the 1k comparison baseline:

```bash
ulimit -n 20000
bun harness/run.ts --target akan-single --suite websocket --vus 5000 --duration 60s --msg-per-sec 10
bun harness/run.ts --target akan-single --suite websocket --vus 10000 --duration 60s --msg-per-sec 5
```

The 5k/10k rows are local stress profiles. Interpret them with RSS, event-loop lag, drop
rate, and k6 load-generator limits in mind. The first publishable comparison target is
the 1k local median across repeated runs.

## Tracing (internal improvement)

Tracing is gated behind `AKAN_TRACE=1` and is **off by default** so comparison benchmarks
pay nothing for it. To capture per-stage latency, queries/request, cache hit ratio and the
DataLoader batch size, run an akanjs pass with tracing on:

```bash
AKAN_TRACE=1 bun harness/run.ts --target akan-single --suite signal,db --vus 50 --duration 30s
bun report/generate.ts <runId>   # section 2 now shows hotspots + section 3 a backlog
```

Instrumentation points (all no-op when `AKAN_TRACE` is unset):

- `pkgs/akanjs/signal/trace.ts` — span collector + aggregator (AsyncLocalStorage based)
- `pkgs/akanjs/signal/signalContext.ts` — `argParse`, `guards`, `handler`, `resolveReturn`, `serialize`, `total`
- `libs/shared/srvkit/accountMiddleware.ts` — `jwtVerify`
- `pkgs/akanjs/signal/middleware.ts` — cache hit/miss
- `pkgs/akanjs/server/resolver/database.resolver.ts` — queries/request + DataLoader batches
- `pkgs/akanjs/server/processMetricsCollector.ts` — event-loop lag + GC duration
- `pkgs/akanjs/server/akanApp.ts` — gateway proxy-hop timing

### How the trace snapshot is collected

The aggregated snapshot is exposed per worker on `GET /_akan/app/metrics` under
`children[].metrics.trace`. However, the akan worker loads the **app-server bundle** and the
**framework metrics collector** in separate module realms (each gets its own `globalThis` and
even its own `process`), so the in-realm aggregator that records spans is not visible to the
collector that serves the metrics endpoint. To bridge that boundary the recording realm also
flushes the cumulative snapshot (throttled, ~1s) to a file given by `AKAN_TRACE_FILE`. When
`AKAN_TRACE=1` is set, the harness points the worker at `results/<runId>/<target>.trace.json`
and folds that file into each result record's `resource.trace`. The snapshot is cumulative
across the whole server run, so per-endpoint counts span every scenario in the pass.

## Regression gate (CI)

The "internal improvement" half is wired for CI: store baselines, then fail a PR if latency
rises or throughput falls beyond the ratios in `config/slo.json`.

```bash
# create/refresh baselines from a known-good run
bun regression/check.ts --run <runId> --update

# in CI: run the bench, then gate
bun regression/check.ts --run <runId>     # exits 1 on regression
```

Baselines live in `regression/baselines/<target>__<scenario>.json` and are committed.

## SLO targets

`config/slo.json` holds absolute target lines per surface (e.g. `pure_http_no_db.maxP99Ms`).
These are the bar we want akanjs to clear, independent of competitors. **Calibrate them to
your benchmark hardware on the first run, then freeze.** The harness marks each scenario
PASS/FAIL against these in the report.

Current first target bands:

- `pure_http_no_db`: 50k RPS, p99 under 5ms.
- `signal_no_db`: 20k RPS, p99 under 10ms.
- `db_find_one`: 10k RPS, p99 under 20ms.
- `db_list`: 5k RPS, p99 under 20ms, with 2 DB queries/request in traces.

Reports show `TARGET MISS` when a row misses these optimization bands. That is distinct from
request failure; use the `Err %` column for HTTP/application errors.

Process SLO targets are evaluated separately in the report's Process stability section:

- cold start p95 under 1500ms;
- idle RSS under 150MB for the minimal single target;
- event-loop lag p99 under 20ms;
- soak RSS growth under 25MB/hour;
- soak error rate under 0.1%.

## akanjs target setup (important)

The `akan-single` / `akan-cluster` targets assume the `minimal` app with the shared `user`
model + `admin` auth, served via the gateway on :8282. The harness handles the akanjs-specific
setup automatically:

1. **Root admin must be valid.** `initializeAdmin` validates `accountId` as an email, so the
   default `{ accountId: "admin" }` is rejected and login fails. The `minimal` app's
   `env.server.local.ts` sets a valid `rootAdminInfo` (`bench-admin@akanjs.com` /
   `benchadmin1234`). Point at different creds via `BENCH_AKAN_ADMIN_ACCOUNT_ID` /
   `BENCH_AKAN_ADMIN_PASSWORD`, or skip login with `BENCH_TOKEN=<jwt>`.
2. **Login + warmup.** The harness logs in via `POST /api/admin/signinAdmin`, retrying through
   worker warmup (the gateway answers 503 until a federation child is ready).
3. **Seeding.** akanjs document ids are server-generated strings, so the harness seeds
   `BENCH_AKAN_SEED` (default 10000) users via `POST /api/user/createUser` and feeds the
   returned ids to k6 for find/relation. Reset accumulated local data between calibrations by
   deleting `local/apps/minimal/minimal-local*.db*`.
4. **Benchmark logging.** Built-in akan targets set `AKAN_PUBLIC_LOG_LEVEL=warn` and
   `AKAN_LOG_FILE_LEVEL=warn` to keep endpoint debug logs from distorting load-test output.

Signal endpoints are prefixed by the service constant ref when one exists; model slice paths below use
`/api/<refName>/<endpoint>/<params>`, while the no-DB minimal benchmark endpoint is `/api/benchPing`.
The verified `user`/`admin` paths (find/relation public; list/create need the admin bearer token):

```json
{
  "akan-single": {
    "paths": {
      "ping": "/api/user/lightUser/{id}",
      "pureHttp": "/_akan/bench/ping",
      "signalNoDb": "/api/benchPing",
      "find": "/api/user/user/{id}",
      "list": "/api/user/userList?limit=20&skip=0",
      "relation": "/api/user/user/{id}",
      "create": "/api/user/createUser",
      "login": "/api/admin/signinAdmin"
    }
  }
}
```

To benchmark a different app, copy `targets.local.json.example` to a gitignored
`benchmarks/api-benchmark/targets.local.json` and override the relevant fields (or set `BENCH_AKAN_APP`).
The legacy `ping` path intentionally remains the light public fetch (`lightUser`) for continuity.
Use `pureHttp` and `signalNoDb` for the isolated no-DB tracks.

## Optional DB-layer targets (Prisma / Drizzle)

The DB surface ships with the raw `bun:sqlite` ceiling. To add Prisma/Drizzle as ORM
comparison points, create a competitor server under `competitors/prisma/` (resp. `drizzle/`)
that exposes the same canonical endpoints against the same dataset, then register it in
`targets.local.json`. Kept optional to avoid pulling heavy ORM toolchains into the repo.

## Directory layout

```
benchmarks/api-benchmark/
  config/slo.json            # absolute SLO targets + regression ratios
  competitors/               # minimal servers exposing identical endpoints
    shared/{dataset,jwt}.ts  # shared seed data + JWT (applied to all targets)
    raw-bun/ elysia/ hono/ fastify/ raw-sqlite/
  k6/{rest,websocket,fullstack}.js   # load scripts (env-parameterized)
  harness/                   # orchestration (Bun)
    run.ts coldstart.ts targets.ts resourceSampler.ts lib.ts
  regression/check.ts        # baseline diff + CI gate
  report/generate.ts         # markdown + chart-data output
  results/<runId>/           # gitignored outputs (raw JSON, report.md, chartdata)
```
