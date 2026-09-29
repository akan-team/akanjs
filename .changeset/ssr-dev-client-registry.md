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
  already imported for that URL. A client module the RSC payload names that also exports constants re-runs in place.
- A save that changes nothing the server renders (a `"use client"` module that keeps its export names, or a module only
  client code imports) keeps the page's build id and refetches no RSC payload. One that does — a component both sides
  render, a constant — holds its client patch until that save's pages build lands, then sends the patch and the RSC
  refresh together, so the page never runs new client code against old server props. A constant edit that reloads
  waits for that build too, and a backend restarted by a server-only save renders from the latest pages build.
- The registry builds once in a build worker after the dev server boots, beside the builder's slow lane, and each route
  build adds the entries its page names that the registry lacks; a page served before the registry exists waits for
  it in the browser, in short holds. Route builds no longer bundle browser chunks in dev, which took about 240MB off
  the builder's peak on apps/akan.
- Most saves are patched in the resident builder: a new file, a new import from a package something already resolved,
  a moved or renamed file (a case-only rename, `Foo.tsx` to `Foo/index.tsx`, a file created beside a folder an import
  resolved to), a deleted module brought back. A whole build in a build worker is left for a new npm package, a signal
  save (its metadata is inlined into the client runtime; a dictionary save does not rebuild the SSR registry, which
  inlines none), and a registry whose last whole build was cut short. A save that does not compile — a typo in an
  import included — is reported by the builder at once, and the save that fixes it patches in about 120ms.
- A failed build keeps the registry the tabs and the next save read. Its error stays on the overlay, is shown to a tab
  opened while it stands, and clears with the save that fixes it — for a route that failed on a shared module too,
  which is built again once a newer build goes green. A broken file no page imports any more stops failing saves.
- A client module whose top level threw, or a store that throws at startup, recovers with the save that fixes it, and
  the dev server's error page carries the HMR client, so it reloads once the fix lands. A pages bundle that builds but
  throws while it loads shows its error while the RSC worker keeps serving the bundle it had.
- A tab that reconnects after a backend restart loads the patches it missed and refetches its payload instead of
  reloading; one that reconnects to a new dev session (a new `akan start`, a config restart) reloads onto its registry.
  A tab that booted beside the vendor file of the build before loads the newer one, so a new npm import in a leaf
  component works without a manual refresh.
- A build worker exits with the builder that spawned it, and a boot build whose worker was killed is retried after 10
  seconds. On Windows, registry writes retry a rename refused while a reader holds the file, and a build worker hashes
  the same bundle config as the builder, so saves are not all handed to whole builds.
