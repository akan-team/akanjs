---
"akanjs": patch
"@akanjs/devkit": patch
---

fix(dev): a typo's fix patches at once, a constant edit reloads onto its new server output, and the first page after `akan start` no longer waits for the SSR registry

- A save that does not compile is reported straight from the resident builder and keeps its state, instead of going to
  a build worker the next save waited behind; the fixing save shows in about 120ms. A failed pages build keeps the last
  good server graph and carries its files to the next build's check, so the fix is not held for a pages build either.
- A reload a constant edit sets off now waits for that save's pages build, so the reloaded page renders the new server
  output instead of the old one and needs no second refresh.
- A save's routes are invalidated once, not twice, and a route build a save overtook retries within a 15s budget:
  a page opened while saves land no longer comes up with an RSC error.
- The SSR registry's boot build runs beside the builder's slow lane: on apps/akan the first page after `akan start` is
  interactive about a second sooner. A save during a CSR build being armed no longer holds up the SSR patch.
- The dev error page reloads on a client patch or a recovered build, and preloads no React Refresh runtime. A tab that
  missed a patch before its WebSocket connected catches up on it once it has started. Registry writes retry a rename Windows
  refuses while a reader holds the file.
