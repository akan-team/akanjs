---
"akanjs": patch
"@akanjs/devkit": patch
---

A CSR page or layout whose async render throws says so, a cached page whose layout redirected renders again, and a
dev client module that imports a macro builds.

- An async render that rejected used to leave its layer blank with nothing in the console, since the promise's
  failure was dropped. It is now logged with the stack and the layer it belongs to (`render of page 2 of
  /:lang/home failed: …`).
- `akan:debug:frame` takes `memory` besides `1`: the frame trace goes to `window.__AKAN_FRAME_TRACE__` (the last
  2000 events) instead of the console. A native dev build mirrors each console call over the bridge, which slows the
  frame enough to hide a timing bug; `memory` does not. Async page and layout renders add `layer.render`,
  `layer.settle` and `layer.fail` events.
- A cached page whose layout redirected renders that layout again when it is back on screen. Signed out, a
  layout that sends the person to the sign-in page kept its empty result, so the page stayed blank after the sign-in
  brought them back (a native app opens its home first, so it always did). A render that issued a redirect while it
  ran is now rerun the next time its page becomes current; `router.redirectCount()` is what it compares.
- `window.__AKAN_DUMP_FRAME__()` reports the frame's location, stack and phase and every recent async page and
  layout render: settled or pending, still awaited, drawn. It records only the latest state, so it does not change
  the timing a trace would.
- `akan start` no longer fails a dev client build with `ReferenceError: __akanMeta is not defined` when a file
  imports a macro (`useClient.ts`'s `with { type: "macro" }`) whose modules read `import.meta` at the top level.
  Bun applied the dev build's `import.meta` rewrite to the macro's modules too, and ran them where nothing declared
  the rewritten name; such a file now has its macros run by a build of its own first.
