---
"@akanjs/devkit": patch
---

perf(devkit): a signal or dictionary save under `akan start` restarts only the backend

A save of a `*.signal.ts` or `*.dictionary.ts` file, or of `lib/dict.ts`, `lib/sig.ts`, `lib/useClient.ts` or
`lib/useServer.ts`, used to stop the builder and the backend and start both again: a new base build, and a new watch
of every root. The builder now keeps running. The save's batch rebuilds the CSR and SSR registries in a build worker
as before, and its pages build also rebuilds the dictionary assets and rewrites `base-artifact.json`. The dev host
restarts the backend once that pages build is green and no registry build since the save failed. Until then the
running backend answers with what it served before the save. After a red build, the backend restarts at the next
green one. A registry the builder holds in memory now also compares the stamps of the signal and dictionary files on
every patch.
