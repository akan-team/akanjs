---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

A coding agent now finds the imports and signatures a first app needs in its skills, instead of reading the akanjs sources.

- **The `akan-service` and `akan-page` recipes** start each file with its import lines, and the `akan-service` rules say what `serverMode: "batch"` does: the module, endpoints included, mounts only in a `batch` or `all` process, so a page-facing service leaves it off.
- **A new `akanApi` guideline** lists every import path and the exact signatures of the route stages, `router`, `Link`, `serve`, `adapt`, the endpoint builders, `SignalOption`, `serviceDictionary`, and the keys of `akan.config.ts` with the `web` and `i18n` shapes. It is generated from the akanjs types of the same release, and a test fails when the two drift apart. `akan agent install` ships it as a reference of both skills, and `get_guideline` / `akan guideline show akanApi` print it.
- **`ServiceOptions.serverMode`** carries a doc comment, so an editor shows the same explanation on hover.
