---
"akanjs": patch
---

A server logs, at `debug`, how long its boot took and where: `Initialized in 38.4ms (uses 0.2 · adaptors 10.4 · serverSignals 0.2 · services 0.5 · internals 0.1 · slices 0.6 · endpoints 0.2 · web 22.2 · builtinRoutes 3.8)`. The DI stages are also readable as `DiLifecycle.initTimings`.
