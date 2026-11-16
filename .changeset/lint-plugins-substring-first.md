---
"@akanjs/devkit": patch
---

A whole-app lint runs about four times faster: `biome check apps/akan` in this repository went from 8.0 s to 2.0 s (median of five runs each on an Apple M4 Pro, 14 cores), where the same check with no lint plugins takes 0.95 s; `akan lint akan` went from 17.2 s to 5.0 s and `akan lint minimal` from 2.3 s to 1.7 s on the same machine. The ten costliest grit rules shipped in `@akanjs/devkit/lint` (the four colour rules, `no-conditional-st-hook`, `no-web-storage`, `no-web-only-api-outside-webkit`, `no-document-cookie`, `no-oversized-list-limit` and `no-unpublished-form-setter`) now check for a substring every match contains before their regex or code snippet runs, because Biome's GritQL engine pays for a regex or a snippet on every node it tries. Every rule reports the same diagnostics as before, and `biome.base.json` is unchanged, so a workspace picks this up by updating `@akanjs/devkit`.
