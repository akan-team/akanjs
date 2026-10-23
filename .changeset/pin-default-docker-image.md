---
"akanjs": patch
---

`akan build` writes `FROM oven/bun:1.4.4-slim` when an app declares no `docker.image`. The default was `oven/bun:1-slim`, a floating tag that pulled whichever Bun was newest at build time, so a production image could run a Bun release the framework was never tested on. To run another Bun, set `docker.image`.
