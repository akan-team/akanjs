---
"akanjs": patch
"@akanjs/devkit": patch
---

A server page from `akan build` now preloads its client modules from `<head>`, so a cold load stops waiting on chains of imports.

- **What is preloaded:** the rsc client and the chunks it imports, the chunks every client reference row (`I` row) in the shell's flight names, and the importmap vendors those chunks import, each with its own chunks. A client URL that only the page's own text carries is never preloaded. Before, only the rsc client and the locale dictionary were preloaded. The browser found the rest one import level at a time, after the document finished.
- **Measured on `apps/minimal`:** `/en/explore` preloads 64 modules and its flight names 37 client chunks, all of them preloaded. `/en/lab/buttons` preloads 165 for 137. Preloading every client component each route's page and layouts import would have meant 274 modules for `/en/explore`, so the preloads follow the flight instead.
- **A boundary that resolves after the shell** still loads its chunks when its flight rows arrive. `akan start` preloads nothing new, because a dev page loads its client code from the SSR dev registry.
- `routes-manifest.json` carries the preload table as `modulePreloads`: the runtime chunks, each vendor's chunks, and the vendors each browser chunk imports.
