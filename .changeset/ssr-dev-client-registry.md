---
"akanjs": patch
"@akanjs/devkit": patch
---

feat(dev): SSR pages load their client code from a dev module registry

- Under `akan start`, an SSR page's `"use client"` code now comes from a module registry under
  `.akan/artifact/ssr-dev`, the same machinery the dev CSR registry uses, instead of the route chunks. React and the
  akanjs vendor facets stay the import map's, so the page keeps one React and one store registry. The route chunks and
  the `client-refresh` that re-imported all of them are gone from dev; `akan build` is unchanged.
- A save patches the changed module in place with React Fast Refresh: state stays, and on minimal a component edit
  shows in about 110ms instead of 900ms. Undoing an edit now shows too; with chunks the browser kept the module it had
  already imported for that URL.
- A save that changes nothing the server renders (a `"use client"` module that keeps its export names, or a module only
  client code imports) no longer refetches the page's RSC payload. One that does — a component both sides render, a
  constant — holds its client patch until that save's pages build lands, then sends the patch and the RSC refresh
  together, so the page never runs new client code against old server props for the length of a pages build.
- The registry builds once in a build worker after the dev server boots, and a route build answers only once the
  registry holds every entry its manifest names. Route builds no longer bundle browser chunks in dev, which took about
  240MB off the builder's peak on apps/akan.
