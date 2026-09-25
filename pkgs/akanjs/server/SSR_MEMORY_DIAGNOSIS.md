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

Key fields:

- `rssBytes`, `heapUsedBytes`, `jscHeapSizeBytes`: distinguish RSS-only native retention from JS heap retention.
- `rscRenderCount`, `rscInFlightRenderCount`: detect request lifecycle leaks.
- `rscLoadedRouteModuleCount`, `rscRouteModuleCacheHits`, `rscRouteModuleCacheMisses`: detect route module warm-up.
- `ssrChunkRegistrySize`, `ssrChunkLoadCount`: detect full-document SSR client chunk retention.
- `httpFullSsrCount`, `httpRscNavigationCount`, `httpStaticAssetCount`, `httpImageCount`: separate request kinds.

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

## Dev Builder Recycle

The dev builder has the same problem for a different reason: `Bun.build` retains native bundler arenas
that no GC reclaims, so the process only returns that memory by exiting. `AkanAppHost` therefore
recycles it — gracefully, after its queues drain and once it has stayed quiet — past a ceiling:

```sh
AKAN_BUILDER_MAX_RSS_MB=1200   # 0 leaves the builder unbounded; default is 1200 in dev
AKAN_BUILDER_MAX_RSS=1200mb    # same ceiling with a unit suffix
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
