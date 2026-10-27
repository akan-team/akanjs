---
"@akanjs/cli": patch
---

`akan lint <app>` passes for an app whose libs carry env modules: the sync now writes `env/env.server.type.ts` the way Biome prints it (no leading blank line, imports sorted, a final newline), where before it rewrote a file Biome rejected on every run. The `libEnv` spreads keep the libs' dependency order.
