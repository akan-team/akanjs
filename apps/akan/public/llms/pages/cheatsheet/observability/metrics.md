# Metrics

- Source: /cheatsheet/observability/metrics
- Mirror: /llms/pages/cheatsheet/observability/metrics.md
- Section: cheatsheet
- Category: Observability
- Priority: P2

## Headings

- Health And Metrics (#overview)
- Check Health (#health)
- Check Metrics (#metrics)
- Scrape With Prometheus (#prometheus)
- Find Slow Statements (#statements)
- Dashboard And Alerts (#dashboard)
- How To Read (#read)
- Memory Logs (#memory-log)
- Troubleshooting Order (#checklist)

## Content

Metrics

off

Health And Metrics

When an app feels slow or stops answering, ask the running app before you guess. Two endpoints are built in and need no setup.

Where to look

What it answers

- GET /_akan/app/health: **Is it alive?** Whether each replica is up and ready to take requests.

- GET /_akan/app/metrics: **How busy is it?** Requests in flight, calls and errors per endpoint, WebSocket load, memory and the render queue.

- GET /_akan/app/statements: **Which query is slow?** The SQL statements that took the most time, with the model call and the endpoint that sent each.

- akan logs <app>: **Why?** Which endpoint, queue or render path produced those numbers.

**No setup, no token.** Both are plain GET routes at the root of the app port (`8282` by default), not under the API prefix.

**Same shape with or without a gateway.** A solo replica answers in the gateway's shape and adds `"solo": true`.

**Only checking the port?** `/_akan/bench/ping` answers a plain `ok`.

Words used on this page

Term

- gateway: A front process that hands requests to replicas, e.g. under `akan start` or with 2+ replicas.

- replica: A server process that handles requests or jobs; each one is an entry in `children`.

- solo: One replica with no gateway in front, the container default; it answers both endpoints itself.

- RSC worker: The separate process that renders pages, one per web-serving replica.

Check Health

Open health first when the app does not load. It tells you whether the server answers and whether each replica is ready.

Call it on the app port with the `AKAN_STATUS_TOKEN` bearer; outside `local`, a caller without it gets only `{ status }`. The second line prints only the replica summary and needs `jq`:

Under `akan start`, a gateway runs one replica, and the response looks like this (trimmed):

Response

Reading the fields

Field

- status: `running`, or `stopping` while the server shuts down.

- children[].role: `all` does both, `federation` serves requests, `batch` runs background internals only.

- children[].ready: `true` once the replica has booted and can take requests or jobs.

- children[].status: Where the replica is in its lifecycle; see the table below.

- restartCount, lastRestartReason, lastErrorMessage: How often the replica restarted and why; read these first when it keeps coming back.

- solo: Appears only in solo, where the replica's entry carries no restart fields.

Replica status

status

Meaning

- starting — The process was spawned and is still booting.

- ready — It takes requests, but the gateway's first health ping has not come back yet.

- healthy — It answers the gateway's health ping, sent every 2 seconds.

- unhealthy — It missed pings for 5 s (15 s under `akan start`) or was unreachable; the gateway restarts it.

- exited — The process ended, and the gateway starts it again.

- crashed — `akan start` only: boot failed three times in a row, so it waits for your next save.

**A 200 does not mean ready.** Health answers 200 while the process is up, even while a replica is `starting` or restarting. For readiness, call `/_akan/app/ready`, which answers 503 until the app can serve, and takes the same token for the detail.

Check Metrics

Open metrics when the app answers but feels busy. It shows traffic, WebSocket load, memory and the render queue for every process.

Call it the same way; outside local it answers 401 without the token, the one to give a scraper. The second line picks two numbers per replica:

A trimmed response with a gateway in front:

**The top level is the gateway's view.** `rooms` counts pubsub rooms with a subscriber, and `sockets` the sockets subscribed to one.

**`children` has one entry per replica.** Its `metrics` carries that replica's traffic, memory and render numbers.

**Request and socket counts are live.** The gateway counts `activeRequests`, `totalRequests` and `activeWebSockets` as it passes traffic on; memory, lag and render numbers are periodic samples.

With a gateway, or solo

A solo replica has no gateway counting for it, so several fields come back empty:

Gateway

Solo

- Top level

  - rooms · sockets: Pubsub rooms with a subscriber, and the sockets subscribed to them.

  - gateway: The gateway process's own memory and event-loop sample.

  - proxyHop: Time to hand a request from the gateway to a replica, only with `AKAN_TRACE=1`.

- Each replica, in children[]

  - activeRequests · totalRequests: Requests in flight now, and requests since the replica started.

  - activeWebSockets: Open WebSocket connections passed to this replica.

  - restartCount · lastRestartReason: How often the replica restarted, and why the last time.

  - rssBytes · heapUsedBytes: The replica's memory in the last sample.

  - rscWorkerRssBytes: Memory of the replica's RSC worker, which is a separate process.

  - eventLoopLagP99Ms: How late timers fired in the last window; high means something blocks the process.

  - rscPendingRenderCount: Renders sent to the RSC worker that have not come back yet.

  - trace: Per-endpoint timings and query counts, only with `AKAN_TRACE=1`.

Has a value

null, 0 or absent

Scrape With Prometheus

The same route and token answer a Prometheus scrape. Every endpoint and page call is counted and timed with tracing off, so per-endpoint rate, errors and latency need no setup. `Accept: application/openmetrics-text`, which Prometheus sends, gets OpenMetrics 1.0 and `text/plain` alone the 0.0.4 text. `*/*`, `application/json` or no Accept keeps the JSON, whose `metricFamilies` carries the same series.

Series

- akan_endpoint_requests_total, akan_endpoint_request_duration_seconds: Calls and their latency per endpoint over HTTP, websocket and MCP, labelled `endpoint` (`query:getUser`, as a trace names it) and `status_class` (`2xx` to `5xx`).

- akan_page_requests_total, akan_page_request_duration_seconds: Page documents and RSC payloads per `route` id (`/:lang/blog`), timed to the start of the response; a path no route matches counts as `unmatched`.

- akan_route_cache_lookups_total: Route cache lookups by `cache` (`rsc` in the render worker, `html` in the web server) and `outcome`: a `hit` or `miss` whose `reason` is `requested-query` or `rewritten-query`, or a `bypass` whose `reason` says why the request skipped the cache, such as `request-not-public`.

- akan_rsc_workers, akan_rsc_workers_ready: RSC workers the app runs, and those ready to render; fewer ready than running means pages wait or fail.

- akan_rsc_renders_pending, akan_rsc_sends_queued, akan_rsc_worker_resident_memory_bytes: The worker's render queue, its unsent messages and its memory, sampled like the JSON fields.

- akan_rsc_renders_in_flight, akan_rsc_render_queue_depth, akan_rsc_renders_abandoned, akan_rsc_render_queue_wait_seconds, akan_rsc_render_refusals_total: Renders running and renders waiting for a slot. With `AKAN_RSC_WORKER_MAX_CONCURRENCY` set, also renders still running after their slot came back, each render's wait, and by `reason` the 503s (`queue-full`, `wait-timeout`) and slots taken back (`hold-timeout`).

- akan_rsc_worker_restarts_total, akan_rsc_worker_recycles_total: Worker restarts after it exited or hung, and planned swaps at a memory limit.

- akan_db_statements_total, akan_db_statement_seconds_total, akan_db_statement_wait_seconds_total, akan_db_statement_rows_total, akan_db_statement_duration_seconds: SQL statements' runs, run time, wait, rows and latency (16 buckets, 0.1 ms to 10 s), labelled `model` and `op` only; the per-statement detail is in Find Slow Statements below.

- akan_live_rooms: Live-query rooms a process holds, one per room id. Behind a gateway the sum counts a room once per replica holding it, not distinct rooms; the gateway's `rooms` counts distinct pubsub rooms.

- akan_room_replay_bytes, akan_pubsub_buffered_messages: Frame bytes kept to send a reconnecting socket what it missed (at most 64 MiB a process), and publishes waiting for the Redis link (at most 10,000); one total each, next to `rooms`.

- akan_build_info, process_start_time_seconds: The akanjs release and app name as labels, and when the answering process started; a new start time means its counters began again.

**Labels stay bounded.** No label carries a URL, user, account, query or value; each takes at most 2,000 values and counts the rest as `other`. Request latency has 12 buckets from 1 ms to 10 s.

**Behind a gateway, one scrape covers every replica.** The gateway adds the replicas' counters and buckets, so take a percentile with `histogram_quantile` over the sum. Replicas report every `AKAN_MEMORY_LOG_INTERVAL_MS`; set it to your scrape interval.

**A restart starts a replica's counters from zero.** The gateway keeps the counts it had, so its sum never drops; a solo process restarts with the pod, which `process_start_time_seconds` shows and `rate()` already handles.

Find Slow Statements

Each SQL statement the SQLite or Postgres driver sends is known by its **fingerprint**, 12 hex characters hashed from its normalized text: every literal becomes `?` and an `IN (…)` list collapses to one, so `LIMIT 10` and `LIMIT 20`, or three ids and thirty, are one statement. Filters that differ only by JSON field share one entry.

`/_akan/app/statements` answers behind the metrics token with the 20 statements that took the most time in all and the 20 slowest at p95, each with its text, the model call that sent it, its wait and rows, and the endpoints that sent it most:

**Model and op name the call.** A model call's statement takes its name (`memo.count`); others, like a `find` chain or raw query, their table and verb (`memo.select`). `sentBy` lists up to 3 endpoints, slices or jobs.

**Wait is counted apart from run time.** `waitMs` is the wait for SQLite's write turn or a Postgres pool connection, shown on `BEGIN` for a transaction. A long wait with a short run means queued writes, not a slow query.

**The table stays bounded.** A process keeps 500 statements, letting the cheapest go first, and 16 senders each. Behind a gateway each replica sends its costliest 50 with every report, every `AKAN_MEMORY_LOG_INTERVAL_MS`, and the gateway adds them up by fingerprint.

**The report is not a counter.** Its sums cover the statements listed now over `sinceMs` and fall when a statement is dropped or a replica restarts. Use the `akan_db_statement*` series, which only grow, for rates and trends.

**No value leaves the driver.** The series carry only model and op; the report and both logs add the normalized text and the fingerprint, never a bound value, id or user data.

Slow-statement log

A statement whose wait and run reach `AKAN_LOG_SLOW_STATEMENT_MS` writes one `SlowStatement` warning, at most once a minute per fingerprint; the next carries the skipped count as `suppressed`. Its attrs are `fingerprint`, `model`, `op`, `ms`, `waitMs`, `rows`, `sentBy` and the request's `traceId`:

- AKAN_LOG_SLOW_STATEMENT_MS (number (ms) | off, default 200): A statement whose wait and run add up to this writes one `SlowStatement` warning; `off` or `0` turns the log off.

- AKAN_QUERY_PLAN_IGNORE (fingerprint,… | all, default unset): Fingerprints whose full scan or sort is deliberate, which the local query-plan check leaves alone; `all` turns the check off.

Query-plan check

In the local dev runtime only, the server asks the database how it ran each new statement (`EXPLAIN QUERY PLAN` on SQLite, `EXPLAIN` on Postgres) and warns once as `QueryPlan` when it reads every row of the table or sorts in a temporary table:

It leaves alone a table under 1,000 rows, an insert, a `count` with no filter and a migration. To accept a deliberate scan, list its fingerprint in `AKAN_QUERY_PLAN_IGNORE`; `all` turns the check off.

Dashboard And Alerts

The chart in `infra/app` marks the pod for scraping once a branch asks for it; it is off by default, since the route answers 401 without the token. Keep the token in a Secret under the key `AKAN_STATUS_TOKEN` and name only the Secret in the values file; `scrape` requires `tokenSecret`:

The pod then carries the `prometheus.io/scrape`, `/path` and `/port` annotations, which do nothing on their own: a Prometheus pod job keeps annotated pods and sends the token as a bearer from a file, here a copy of the Secret mounted into Prometheus's namespace. With the Prometheus Operator, a `PodMonitor` in the app's namespace names the Secret in `authorization.credentials` instead.

Dashboard

Import `infra/monitoring/akan-dashboard.json` into Grafana and pick a Prometheus data source. It shows request rate, 5xx ratio and p95 latency per endpoint and per route, the route caches' hit ratio, the RSC workers running and ready, their queue, memory and restarts, and the build each process runs. The job, endpoint and route pickers narrow every panel.

Alerts

`infra/monitoring/akan-rules.yaml` is a Prometheus rules file; wrap its `groups` in a `PrometheusRule` for the Operator. The thresholds are conservative, so tighten them once you know your traffic:

Alert

Fires when

Look at

- AkanEndpointErrorRatioHigh — More than 5% of an endpoint's calls answer 5xx for 15 minutes, at six calls a minute or more. — `akan logs` for that endpoint; a 4xx is the caller's and never counts.

- AkanPageErrorRatioHigh — The same, for a route's documents and RSC payloads. — The render path in the logs, and the RSC worker panels.

- AkanEndpointLatencyHigh · AkanPageLatencyHigh — The 95th percentile stays above 2.5 s for 15 minutes, at six calls a minute or more. — `eventLoopLagP99Ms` and the render queue first, then `AKAN_TRACE=1` for that endpoint's steps.

- AkanRscWorkerUnavailable — warning: a process runs more RSC workers than are ready for 10 minutes; critical: none is ready for 3. — `rscWorkerStatus` and the restarts in health; frequent recycles point at render memory.

How To Read

One snapshot rarely tells the story. Take a few samples a minute apart, and read each number against the question it answers.

Number

What it tells you

- activeRequests: Requests being handled now; if it stays high, a slow endpoint may be holding work.

- activeWebSockets, rooms, sockets: Realtime load: open connections, and the rooms they subscribe to.

- rssBytes, heapUsedBytes: Memory size; watch the trend across samples, not one value.

- rscWorkerRssBytes: Add it to the replica's `rssBytes`; the sum is what the replica really costs.

- rscPendingRenderCount: Server renders waiting on the RSC worker; a rising value means render work is queuing.

- eventLoopLagP99Ms: How late the event loop ran its timers; a high value means work is blocking requests.

- restartCount, lastRestartReason: Replica restarts and the last reason; a rising count means the replica keeps failing.

- rscWorkerRecycleCount, rscWorkerLastRecycleReason: Planned RSC worker swaps at a limit such as `rss>…MiB`; frequent swaps point at render memory.

**Most numbers are samples, not live values.** Memory, lag and render counts refresh every `AKAN_MEMORY_LOG_INTERVAL_MS` (60 s by default), and `reportedAt` says when. Compare responses at least one interval apart.

Memory Logs

When one metrics response cannot pin down a memory problem, log every sample and watch how the values move.

Set these in the environment the server starts with: the workspace `.env` locally, or the container env in a deployment:

- AKAN_MEMORY_LOG ("1", default off): Logs one `memory role=…` line per process on every sample, and adds the JSC heap walk (`jscHeapSizeBytes`, `jscObjectCount`, …) to each.

- AKAN_MEMORY_LOG_INTERVAL_MS (number (ms), default 60000): Sample interval for these lines and for the numbers in `/_akan/app/metrics`.

- AKAN_MEMORY_GC_ON_REPORT ("1", default off): Forces a full GC before each sample so heap numbers show live memory, and adds `gcDurationMs`.

Each sample then prints one line per process. Pick those lines out of the running app with `akan logs`:

**`rss` and `rscWorkerRss` are two processes.** Add them to see what the replica really costs.

**`elLag` is mean/p99/max.** It is event-loop lag in milliseconds since the previous sample.

**`rscFirstRenderMemory` names the routes that grew the RSC worker most.** `/_akan/app/metrics` lists, for at most 20 routes, what the first render added to memory and the modules it loaded. Concurrent renders share one delta, so read a quiet replica.

**The gateway's own line is at verbose.** That is below the default `info`, so set `AKAN_PUBLIC_LOG_LEVEL=verbose` to see it in the console.

**Turn `AKAN_MEMORY_GC_ON_REPORT` off once you are done.** The forced GC pauses the process on every sample, even when `AKAN_MEMORY_LOG` is off.

Troubleshooting Order

Go from the cheapest question to the most detailed one, and stop as soon as you find the cause.

**Open health.** If a replica is not `ready` or shows `unhealthy`, fix startup first; `lastErrorMessage` and `lastRestartReason` say why.

**Open metrics.** Check `activeRequests`, `activeWebSockets`, `rooms`, memory and `eventLoopLagP99Ms`, and which endpoint answers `5xx` or slowly in the `akan_endpoint_*` series.

**If an endpoint is slow, open statements.** The top of `/_akan/app/statements` names the statement, its model call and the endpoint that sent it; a high `waitMs` means writes queue behind each other.

**If memory keeps growing,** turn on memory logs and compare several samples.

**Find the cause in the logs.** `akan logs <app>` shows which endpoint, queue or render path made the numbers, and `AKAN_TRACE=1` adds per-endpoint timings to metrics.

Read next

- Live Tail — Filter `akan logs` by level, endpoint, trace and role.

- Request Line And AKAN_TRACE — One summary line per call, and what `AKAN_TRACE=1` adds.

- Scale With AKAN_REPLICA — Replica slots, and exactly when a gateway appears.

- Kubernetes Probes — Which route each of the pod's probes calls.

## Code Examples

### Terminal

```bash
curl -s -H "Authorization: Bearer $AKAN_STATUS_TOKEN" http://localhost:8282/_akan/app/health
curl -s -H "Authorization: Bearer $AKAN_STATUS_TOKEN" localhost:8282/_akan/app/health | jq '.children[] | {role, status, ready}'
```

### Code

```json
{
  "status": "running",
  "pid": 72128,
  "children": [
    {
      "idx": 0,
      "role": "all",
      "status": "healthy",
      "ready": true,
      "pid": 72129,
      "restartCount": 0,
      "restartPending": false
    }
  ]
}
```

### Terminal

```bash
curl -s -H "Authorization: Bearer $AKAN_STATUS_TOKEN" http://localhost:8282/_akan/app/metrics
curl -s -H "Authorization: Bearer $AKAN_STATUS_TOKEN" localhost:8282/_akan/app/metrics | jq '.children[].metrics | {activeRequests, rssBytes}'
```

### Code

```json
{
  "rooms": 12,
  "sockets": 34,
  "gateway": {
    "rssBytes": 180000000,
    "heapUsedBytes": 72000000
  },
  "proxyHop": null,
  "children": [
    {
      "role": "all",
      "rooms": 12,
      "metrics": {
        "reportedAt": 1790223722512,
        "activeRequests": 2,
        "totalRequests": 136,
        "activeWebSockets": 10,
        "rssBytes": 420000000,
        "heapUsedBytes": 60000000,
        "rscWorkerRssBytes": 310000000,
        "eventLoopLagP99Ms": 6.8,
        "rscPendingRenderCount": 1
      }
    }
  ]
}
```

### Terminal

```bash
curl -s -H "Authorization: Bearer $AKAN_STATUS_TOKEN" -H "Accept: application/openmetrics-text" localhost:8282/_akan/app/metrics
# HELP akan_endpoint_requests Endpoint calls answered, over HTTP, websocket or MCP, by status class.
# TYPE akan_endpoint_requests counter
akan_endpoint_requests_total{role="all",endpoint="query:benchPing",status_class="2xx"} 5
# TYPE akan_endpoint_request_duration_seconds histogram
akan_endpoint_request_duration_seconds_bucket{role="all",endpoint="query:benchPing",le="0.001"} 4
akan_endpoint_request_duration_seconds_bucket{role="all",endpoint="query:benchPing",le="+Inf"} 5
akan_endpoint_request_duration_seconds_sum{role="all",endpoint="query:benchPing"} 0.0019
akan_endpoint_request_duration_seconds_count{role="all",endpoint="query:benchPing"} 5
akan_build_info{akanjs_version="3.3.0",app="minimal"} 1
# EOF
```

### Terminal

```bash
curl -s -H "Authorization: Bearer $AKAN_STATUS_TOKEN" localhost:8282/_akan/app/statements
{
  "byTotalTime": [
    {
      "fingerprint": "b37549d5817e",
      "text": "SELECT count(*) as count FROM \"memo\" WHERE ((\"removedAt\" IS NULL) AND (json_extract(\"_doc\", '$.ownerId') = ?))",
      "model": "memo",
      "op": "count",
      "count": 1240,
      "totalMs": 3120.4,
      "meanMs": 2.516,
      "p95Ms": 8.75,
      "waitMs": 0,
      "rows": 1240,
      "sinceMs": 86400000,
      "sentBy": [{ "endpoint": "query:memoListByOwner", "count": 1240, "totalMs": 3120.4 }]
    }
  ],
  "byP95": [ … ]
}
```

### Terminal

```bash
akan logs <app> --grep SlowStatement
# memo.count statement b37549d5817e took 412.3ms (waited 0ms, 1 rows), sent by query:memoListByOwner: SELECT count(*) as count FROM "memo" WHERE (("removedAt" IS NULL) AND (json_extract("_doc", '$.ownerId') = ?))
```

### Terminal

```bash
# memo.count statement b37549d5817e, sent by query:memoListByOwner, reads every row of "memo": SELECT count(*) as count FROM "memo" WHERE … [plan: SCAN memo]. Add an index the filter and sort can use, or list b37549d5817e in AKAN_QUERY_PLAN_IGNORE to accept it.
```

### infra/app/values/<appName>-values.yaml

```yaml
# kubectl -n <appName>-main create secret generic <appName>-status --from-literal=AKAN_STATUS_TOKEN="$(openssl rand -hex 32)"
main:
  metrics:
    scrape: true
    tokenSecret: <appName>-status
```

### prometheus.yml

```yaml
scrape_configs:
  - job_name: <appName>
    kubernetes_sd_configs:
      - role: pod
        namespaces:
          names: [<appName>-main]
    authorization:
      type: Bearer
      credentials_file: /etc/prometheus/secrets/<appName>-status/AKAN_STATUS_TOKEN
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        regex: "true"
        action: keep
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        target_label: __metrics_path__
      - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
        regex: ([^:]+)(?::\d+)?;(\d+)
        replacement: $1:$2
        target_label: __address__
      - source_labels: [__meta_kubernetes_namespace]
        target_label: namespace
      - source_labels: [__meta_kubernetes_pod_name]
        target_label: pod
rule_files:
  - akan-rules.yaml
```

### .env

```bash
AKAN_MEMORY_LOG=1
AKAN_MEMORY_LOG_INTERVAL_MS=10000
AKAN_MEMORY_GC_ON_REPORT=1
```

### Terminal

```bash
akan logs <app> --grep "memory role="
# memory role=all pid=72129 rss=412.3MiB heapUsed=57.5MiB … rscWorkerRss=298.0MiB elLag=1.2/6.8/9.4ms
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

