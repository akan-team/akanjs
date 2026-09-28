---
"@akanjs/cli": patch
---

`akan start` sizes its boot wave against the machine instead of always booting one app at a time.

- With no `--concurrency`, the wave is `min(apps, half the memory budget / ~1.8GB per app, cores / 4)` and never
  below one, so a laptop boots its apps together while a small container still staggers them — which is the case
  the old default of 1 existed for. Measured on a 14-core laptop, two warm apps: the last one is ready at +3.3s
  rather than +4.7s.
- The memory budget is the smaller of the host's RAM and `AKAN_MEMORY_LIMIT` / the cgroup limit. `os.freemem()` is
  not consulted: it counts free pages rather than reclaimable ones and reports ~0.3GB on an idle 48GB laptop, which
  would pin every machine to one app at a time.
- The session prints the wave size and what set it, so a boot that still waits app by app says why.
- `--concurrency <n>` is unchanged as an override and is clamped to the number of apps selected.
