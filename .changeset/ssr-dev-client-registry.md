---
"akanjs": patch
"@akanjs/devkit": patch
---

feat(dev): SSR pages can load their client code from a dev module registry (`AKAN_DEV_SSR_CLIENT=registry`)

- Opt-in for now; the default stays `chunks`. Under `akan start` with `AKAN_DEV_SSR_CLIENT=registry`, an SSR page's
  `"use client"` code comes from a module registry under `.akan/artifact/ssr-dev`, the same machinery the dev CSR
  registry uses, instead of the route chunks. React and the akanjs vendor facets stay the import map's, so the page
  keeps one React and one store registry.
- A save patches the changed module in place with React Fast Refresh: state stays, and on minimal a component edit
  shows in about 110ms instead of 900ms. Undoing an edit now shows too; with chunks the browser kept the module it had
  already imported for that URL.
- A save that touches `"use client"` entries only no longer refetches the page's RSC payload.
- The registry builds once in a build worker after the dev server boots, and a route build answers only once the
  registry holds every entry its manifest names. Route builds no longer bundle the browser chunks in this mode.
