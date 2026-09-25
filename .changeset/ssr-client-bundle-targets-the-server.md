---
"@akanjs/devkit": patch
---

fix(build): target the server when bundling `client-ssr`, so SSR keeps happening

`ClientEntriesBundler` hardcoded `target: "browser"`, and both bundles go through it: the browser one under
`client` and the **server-executed** one under `client-ssr`, which `SsrFromRscRenderer` loads with
`await import(chunkId)`. The browser target resolves the `browser` export condition, so a dependency whose
`browser` entry touches a DOM global at module scope threw the moment the SSR renderer imported the chunk.

That throw lands while React is rendering the shell, so the failure is not scoped to the offending subtree — the
whole document degrades to client rendering, with one browser console line (`Switched to client rendering because
the server rendering errored: document is not defined`) and a ~1KB server body holding nothing but an empty
Suspense placeholder. It was reported against `react-markdown` → `micromark` →
`decode-named-character-reference`, whose browser entry is `const element = document.createElement('i')`, and it
hit **every** route: the generated root layout imports the app store, so the shared UI graph is in every client
entry's SSR chunk graph.

`ClientEntriesBundler` now takes the target as an option — still `"browser"` for the browser bundle — and
`resolveSsrClientBundleOptions` (was `resolveSsrClientExternalOptions`) carries `target: "bun"` for `start` and
`build` alike, so neither `client-ssr` call site can drift. `conditions: ["node"]` is not a fix: Bun *adds*
conditions to the target's defaults, so `browser` still wins. The target itself has to say server.
