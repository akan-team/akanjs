---
"akanjs": patch
---

fix(ui): stop a Model chunk from repainting the page it opened over

`lazy()` returned the React lazy component with no boundary of its own, so a chunk that resolved after
first paint suspended past it to the nearest boundary — the route. Opening a ticket modal or a `⋮` menu
therefore replaced the whole page with the route's loading fallback, once per fresh load, until the chunk
was cached. Portalling to `document.body` did not help: the React ancestor chain is unchanged.

`lazy()` takes `suspense?: boolean`, and only a flagged call site gets a `<Suspense>` of its own. The flag
is opt-in because a boundary also changes server rendering: under the default `renderMode: "stream"` its
subtree leaves the shell as `loading` and arrives later in the stream, which is right for an interaction
shell and wrong for a page body that SEO snapshots, prerendering and pre-hydration E2E read out of the
shell. Every existing call site keeps its exact code path.

The `Model` barrel turns it on for all fifteen exports, and gives `View` and `AdminPanel` a plain block
to hold their height while the chunk loads. Those two are the only ones that occupy space of their own:
the triggers wrap the caller's children, so a fixed block would put a slab where a small button belongs,
and the modals render `null` until opened, so a block would appear where nothing ever shows.

The fallback is a host element and has to be. The barrel carries no `"use client"`, so a client component
referenced from it resolves to `undefined` inside the thunk and the render throws "Element type is
invalid", taking the whole page segment under the layout with it. Marking the barrel `"use client"` is
worse still: `Model.*` becomes a real server→client boundary and apps that pass crystalized model
instances as props fail serialization at boot. Plain markup crosses neither line.

`LazyOption.loading` also starts working on the default path, having been reachable only through
`ssr: false` before.
