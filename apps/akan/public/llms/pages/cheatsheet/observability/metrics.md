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

- GET /_akan/app/metrics: **How busy is it?** Requests in flight, WebSocket load, memory and the render queue.

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

Call it on the app port. The second line prints only the replica summary and needs `jq`:

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

**A 200 does not mean ready.** With a gateway in front, health answers 200 even while a replica is `starting` or restarting. Read `children[].ready`, not the status code.

Check Metrics

Open metrics when the app answers but feels busy. It shows traffic, WebSocket load, memory and the render queue for every process.

Call it the same way; the second line picks two numbers per replica:

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

- AKAN_MEMORY_LOG ("1", default off): Logs one `memory role=…` line per process on every sample.

- AKAN_MEMORY_LOG_INTERVAL_MS (number (ms), default 60000): Sample interval for these lines and for the numbers in `/_akan/app/metrics`.

- AKAN_MEMORY_GC_ON_REPORT ("1", default off): Forces a full GC before each sample so heap numbers show live memory, and adds `gcDurationMs`.

Each sample then prints one line per process. Pick those lines out of the running app with `akan logs`:

**`rss` and `rscWorkerRss` are two processes.** Add them to see what the replica really costs.

**`elLag` is mean/p99/max.** It is event-loop lag in milliseconds since the previous sample.

**The gateway's own line is at verbose.** That is below the default `info`, so set `AKAN_PUBLIC_LOG_LEVEL=verbose` to see it in the console.

**Turn `AKAN_MEMORY_GC_ON_REPORT` off once you are done.** The forced GC pauses the process on every sample, even when `AKAN_MEMORY_LOG` is off.

Troubleshooting Order

Go from the cheapest question to the most detailed one, and stop as soon as you find the cause.

**Open health.** If a replica is not `ready` or shows `unhealthy`, fix startup first; `lastErrorMessage` and `lastRestartReason` say why.

**Open metrics.** Check `activeRequests`, `activeWebSockets`, `rooms`, memory and `eventLoopLagP99Ms`.

**If memory keeps growing,** turn on memory logs and compare several samples.

**Find the cause in the logs.** `akan logs <app>` shows which endpoint, queue or render path made the numbers, and `AKAN_TRACE=1` adds per-endpoint timings to metrics.

Read next

- Live Tail — Filter `akan logs` by level, endpoint, trace and role.

- Request Line And AKAN_TRACE — One summary line per call, and what `AKAN_TRACE=1` adds.

- Scale With AKAN_REPLICA — Replica slots, and exactly when a gateway appears.

- Kubernetes Probes — How the pod's probes call `/_akan/app/health`.

## Code Examples

### Terminal

```bash
curl -s http://localhost:8282/_akan/app/health
curl -s localhost:8282/_akan/app/health | jq '.children[] | {role, status, ready}'
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
curl -s http://localhost:8282/_akan/app/metrics
curl -s localhost:8282/_akan/app/metrics | jq '.children[].metrics | {activeRequests, rssBytes}'
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

