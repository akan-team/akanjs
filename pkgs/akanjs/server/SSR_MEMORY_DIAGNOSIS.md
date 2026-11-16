# SSR Memory Diagnosis

Use this checklist when production RSS grows after visiting SSR/RSC routes.

## Enable Metrics

Set these env vars on one diagnostic pod:

```sh
AKAN_MEMORY_LOG=1
AKAN_MEMORY_LOG_INTERVAL_MS=10000
```

Optional, only for controlled diagnosis because it can affect latency:

```sh
AKAN_MEMORY_GC_ON_REPORT=1
```

Read snapshots from:

```sh
curl http://localhost:8080/_akan/app/metrics
```

A replica and its RSC worker are separate processes and are reported separately. **`rssBytes` is the
replica's own; the worker's is `rscWorkerRssBytes`.** Sum them for what the pod pays.

Key fields:

- `rssBytes`, `heapUsedBytes`, `jscHeapSizeBytes`: the replica. Distinguish RSS-only native retention from JS
  heap retention. The `jsc…` fields walk the whole heap, so they appear only under `AKAN_MEMORY_LOG=1` or
  `AKAN_MEMORY_GC_ON_REPORT=1`.
- `rscWorkerRssBytes`, `rscWorkerHeapUsedBytes`, `rscWorkerJscHeapSizeBytes`, `rscWorkerJscExtraMemorySizeBytes`:
  the same for the worker. `jscExtra` is off-heap, mostly typed-array backing stores.
- `rscRenderCount`, `rscInFlightRenderCount`: detect request lifecycle leaks.
- `rscLoadedRouteModuleCount`, `rscRouteModuleCacheHits`, `rscRouteModuleCacheMisses`: detect route module warm-up.
- `rscFirstRenderMemory`, only under `AKAN_MEMORY_LOG=1`: per route, what its first render in this worker grew
  `rss`, `heapUsed`, `external` and `arrayBuffers` by, and the modules it loaded, largest RSS first, at most 20
  routes. Renders running at the same time land in the same delta, so read it on a quiet pod. It starts with the
  worker and is not cleared by a pages reload.
- `ssrChunkRegistrySize`, `ssrChunkLoadCount`: full-document SSR client chunk loading. **`…RegistrySize` counts
  keys, not bytes** — evicting does not unload the module, so it can never fall on its own.
- `httpHtmlCacheEntries` / `httpHtmlCacheBytes`, `rscResultCacheEntries` / `rscResultCacheBytes`,
  `rscPatchResultCacheEntries` / `rscPatchResultCacheBytes`: what each cache actually holds. Entry count alone
  says nothing when entries span three orders of magnitude.
- `httpFullSsrCount`, `httpRscNavigationCount`, `httpStaticAssetCount`, `httpImageCount`: separate request kinds.

Two things measured on `apps/akan` that shape how to read all of the above:

- **Growth converges; it is not a leak.** Ten passes over the same routes plateau by roughly the sixth, with a
  flat JS heap throughout. Three passes is not enough to tell a plateau from a ratchet.
- **Freeing JS objects does not lower RSS.** Emptying both result caches returns their bytes to the heap and
  leaves RSS unchanged. Only not allocating, or restarting the process, reduces what the pod pays.

## Scenarios

### Same Route Repeated

Hit one SSR page repeatedly:

```sh
for i in $(seq 1 100); do curl -fsS "http://localhost:8080/ko" > /dev/null; done
```

Expected interpretation:

- `rscInFlightRenderCount` must return to `0`.
- If `heapUsedBytes` or `jscHeapSizeBytes` keeps growing, suspect request lifecycle retention.
- If heap plateaus but `rssBytes` ratchets upward, suspect Bun/native RSS retention.

### Unique Routes

Visit many distinct application routes once each:

```sh
while read -r path; do curl -fsS "http://localhost:8080$path" > /dev/null; done < routes.txt
```

Expected interpretation:

- If `rscLoadedRouteModuleCount` grows with RSS/heap, this is framework route warm-up.
- If memory plateaus after all unique routes are visited, the cache is bounded.
- If memory keeps growing after repeats over the same warmed routes, continue with request lifecycle or Bun/native checks.

### RSC Navigation Only

Call the RSC endpoint directly:

```sh
curl -fsS "http://localhost:8080/__rsc?url=/ko/some/path" > /dev/null
```

Expected interpretation:

- Growth here points at the RSC worker route module graph or Flight render lifecycle.
- `httpRscNavigationCount` should increase, while `httpFullSsrCount` should not.

### Full Document SSR

Call page URLs directly without `__rsc`:

```sh
curl -fsS "http://localhost:8080/ko/some/path" > /dev/null
```

Expected interpretation:

- Growth here can include both RSC worker rendering and `ssrFromRsc` client chunk imports.
- If `ssrChunkRegistrySize` grows with memory, inspect SSR-side chunk retention.

## Cache Policy Interpretation

`AKAN_ROUTE_MODULE_CACHE=0` disables the framework wrapper cache for diagnosis only. It does not guarantee RSS reduction because Bun can retain ESM modules after dynamic import.

If route module counters correlate with RSS and heap growth, prefer idle RSC worker recycle for an operational cap. It clears the worker process and Bun module cache together.

## Recycle Thresholds

The RSC worker can be recycled when idle using opt-in thresholds:

```sh
AKAN_RSC_WORKER_MAX_RSS_MB=512
AKAN_RSC_WORKER_MAX_RENDER_COUNT=10000
AKAN_RSC_WORKER_MAX_ROUTE_MODULES=500
AKAN_RSC_WORKER_RECYCLE_GRACE_MS=5000
```

Validate that recycle happens only when `rscPendingRenderCount` is `0`, and that the new `rscWorkerPid` becomes ready before traffic continues.

## Render Concurrency

The RSC worker starts every render it is sent. `AKAN_RSC_WORKER_MAX_CONCURRENCY` makes it run that many at a time
and queue the rest first come, first served; `AKAN_RSC_WORKER_MAX_QUEUE` bounds the queue (default: the cap times
the idle timeout's seconds), and a render past it is answered 503 with `Retry-After`. A stored page is replayed
without a slot. Both are off by default.

The cap bounds the renders admitted, not the ones abandoned. A slot comes back when its client leaves, and after a
render has held it as long as the idle timeout (120 seconds, also where that timeout is off), but the page's own
code runs on until its `await` settles: `akan_rsc_renders_abandoned` counts those renders, and
`akan_rsc_render_refusals_total{reason="hold-timeout"}` the slots taken back. A count that stays up means pages
wait on something with no timeout of its own.

```sh
AKAN_RSC_WORKER_MAX_CONCURRENCY=32
AKAN_RSC_WORKER_MAX_QUEUE=3840
```

A page that awaits data holds its slot while it waits, so a cap below the number of pages waiting at once costs
throughput. The soak that measured it builds the app with one extra page that awaits `?ms=` before it renders,
then runs a fresh production server per row:

```sh
bun pkgs/@akanjs/devkit/integration/renderAdmissionSoak.ts akan --prepare
```

Each round sends 32 requests at once and waits for all of them, for 12 seconds a row: 70% documents and 30%
`/__rsc` navigations, 5% of them aborted by the client after 5–60 ms. `cpu` renders 32 docs pages with a cookie, so
neither cache stores them; `io` renders the page that waits 20–200 ms; `mixed` is 40% `cpu`, 30% `io` and 30%
anonymous requests for 8 pages the caches hold. Median of three runs (lowest–highest), macOS arm64, Bun 1.4.4, on
a machine other work was sharing:

| mix | cap | req/s | p50 ms | p95 ms | p99 ms | queue wait ms | worker peak RSS MB | worker heap growth MB |
|---|---|---|---|---|---|---|---|---|
| cpu | 2 | 108 (105–109) | 243 (243–256) | 327 (301–335) | 365 (314–370) | 81 (80–84) | 921 (887–959) | 49 (38–77) |
| cpu | 4 | 107 (102–108) | 250 (247–263) | 332 (308–334) | 351 (328–357) | 74 (73–77) | 699 (649–906) | 60 (54–64) |
| cpu | 8 | 103 (98–105) | 262 (260–275) | 342 (330–344) | 355 (346–373) | 59 (59–62) | 908 (861–925) | 57 (51–92) |
| cpu | 16 | 104 (96–104) | 268 (262–290) | 336 (332–354) | 362 (351–374) | 23 (21–25) | 932 (924–945) | 78 (78–87) |
| cpu | 32 | 102 (93–107) | 267 (253–295) | 356 (332–368) | 380 (351–481) | 0 | 993 (949–998) | 82 (74–127) |
| cpu | off | 105 (102–106) | 264 (258–273) | 335 (328–338) | 360 (350–365) | 0 | 1001 (1001–1035) | 85 (82–284) |
| io | 2 | 16 (16–17) | 953 (893–980) | 1851 (1711–1894) | 2047 (1892–2047) | 834 (786–859) | 388 (385–389) | 6 (4–7) |
| io | 4 | 32 (31–34) | 476 (474–482) | 915 (889–917) | 1059 (958–1059) | 357 (356–370) | 396 (365–407) | 13 (9–14) |
| io | 8 | 59 (58–60) | 263 (258–264) | 490 (485–499) | 556 (534–575) | 148 (143–150) | 390 (379–398) | 20 (17–24) |
| io | 16 | 95 (93–97) | 162 (161–163) | 298 (295–304) | 339 (336–348) | 44 (43–44) | 414 (400–445) | 47 (36–55) |
| io | 32 | 150 (143–151) | 120 (118–126) | 200 (198–208) | 207 (205–253) | 0 | 489 (462–508) | 48 (44–80) |
| io | off | 151 (150–151) | 118 (118–121) | 198 (197–200) | 206 (205–207) | 0 | 477 (476–498) | 53 (45–58) |
| mixed | 2 | 47 (45–50) | 199 (179–249) | 709 (617–717) | 879 (830–954) | 285 (246–297) | 573 (552–605) | 17 (13–20) |
| mixed | 4 | 85 (83–86) | 118 (109–121) | 353 (327–364) | 433 (425–459) | 99 (92–110) | 725 (576–788) | 44 (31–48) |
| mixed | 8 | 123 (120–128) | 112 (97–123) | 226 (222–228) | 273 (271–285) | 29 (28–31) | 861 (820–909) | 53 (42–81) |
| mixed | 16 | 133 (131–141) | 114 (108–119) | 208 (205–208) | 254 (251–260) | 6 (5–7) | 893 (868–896) | 59 (46–86) |
| mixed | 32 | 139 (136–147) | 117 (105–123) | 203 (203–212) | 238 (227–247) | 0 | 925 (854–965) | 152 (55–165) |
| mixed | off | 140 (139–148) | 109 (105–113) | 200 (198–206) | 238 (230–243) | 0 | 873 (832–980) | 78 (59–141) |

No row answered a 503: 32 requests never fill the default queue of the cap times 120.

What it shows:

- **`io` loses throughput under every cap below the 32 requests in flight**, in proportion to the cap: 151
  requests a second uncapped, 95 at 16, 59 at 8, 32 at 4. Kept at 32 in flight instead of sent in rounds
  (`--arrival=steady`), the same mix served 278 uncapped, 141 at 16 and 35 at 4. This is why the cap is off by
  default.
- **`cpu` keeps its throughput at every cap**, 102 to 108 requests a second, and its median moves by less than a
  tenth (243–250 ms at 2–4, 264 ms uncapped). With only soft navigations (`--soft=100`) it is 151 to 155 a second
  and 193–204 ms at every cap.
- **A cap does not answer the pages rendered first any sooner.** The worker starts and finishes renders in order,
  but Bun writes a large IPC message from a process that stays busy only once it pauses, so a burst's payloads
  reach the web server together: at a cap of 4 the response headers of a round of 32 soft navigations arrive at a
  median of 197 ms of the round's 203. Driving the worker alone, 32 renders at once have a median of 491 ms
  uncapped and 479–487 ms with the cap, against 164–182 ms when the caller itself sends 4 at a time and so leaves
  the worker idle between them.
- **The cap bounds the worker's heap, not its RSS.** Heap growth during `cpu` was 49–60 MB at caps of 2 to 8
  against 85 MB uncapped, with one uncapped run at 284 MB; peak RSS ran from 699 to 1001 MB with overlapping
  ranges, following the volume rendered in 12 seconds more than how many renders overlap.
- **A bounded queue sheds instead of stretching.** `io` at a cap of 4 with `--queue=8` answered 620 of about
  1,000 requests a run with 503 and served the rest at a median of 202 ms, against 476 ms with the default queue.

So a cap is a bound on a burst, not a way to lower latency: set it to the number of requests one replica is sized
to hold at once, and lower only for pages that render without waiting on data, to hold the worker's heap down.

`akan_rsc_renders_in_flight`, `akan_rsc_render_queue_depth`, `akan_rsc_renders_abandoned`,
`akan_rsc_render_queue_wait_seconds` and `akan_rsc_render_refusals_total` report the queue on `/_akan/app/metrics`.

## Dev Builder Recycle

The dev builder has the same problem for a different reason: `Bun.build` retains native bundler arenas
that no GC reclaims, so the process only returns that memory by exiting. `AkanAppHost` therefore
recycles it — gracefully, after its queues drain and once it has stayed quiet — past a ceiling:

```sh
AKAN_BUILDER_MAX_RSS_MB=2048   # 0 leaves the builder unbounded; default is 2048 in dev
AKAN_BUILDER_MAX_RSS=2gb       # same ceiling with a unit suffix
```

Both resolve through `MemoryLimit.resolveMaxRssBytes`, so `AKAN_MEMORY_LIMIT` or a cgroup limit also
applies (the builder takes 35% of it, the RSC worker 55%). Look for `recycling builder pid=…` followed
by `exiting for recycle` and `announced boot state after recycle`; the last line is what re-points a
running backend at the replacement's artifact.

**How much of that RSS is actually unreclaimable is platform-specific.** Measured on Bun 1.3.14: macOS
returns none of the bundler arenas (0% after 60s idle) while Linux purges them after ~10-15s of quiet,
46-59% of the builder's peak. Since the builder reports its RSS only when its queues drain, that sample
is its *peak* — so before committing, the host waits 20s and re-reads the builder's RSS from the OS,
and skips the recycle if the allocator gave the memory back by itself:

```
[builder-recycle] holding 20s to see whether the allocator returns it (rss=522MiB>=400MiB after 6 build(s))
[builder-recycle] skipped: the builder fell to 214MiB (ceiling 400MiB) on its own, …
```

A builder more than 1.5× over the ceiling skips the wait, since no purge would rescue it. On macOS the
re-read returns the same value, so the only cost there is the delay.

## Dev Idle Suspend

A dev server that nobody is editing still pays for a builder. After five minutes with no build
activity and no route request, `AkanAppHost` releases the builder entirely and watches for edits with
a plain `fs.watch` instead. The backend stays up, so the preview URL keeps serving; only build
capacity goes away. The next edit — or the first request that needs a build — brings it back, paying
one cold boot build (~3.5s on `apps/akan`, ~0.3s on a single-route app).

```sh
AKAN_DEV_IDLE_SUSPEND_MS=300000   # default; 0 keeps the builder resident for the whole session
```

Requests that arrive mid-wake are held and replayed against the new builder rather than answered with
`builder is stopped`. A suspend is skipped while a build is red, while any restart or recovery is
pending, or within 30s of a previous wake. Look for `[idle-suspend] … released the builder`, then
`[idle-suspend] waking (…)` and `[idle-suspend] awake in …ms`.
