---
"@akanjs/devkit": patch
---

A `.loading()` on a layout that sits at a root boundary — `(group)/_layout.tsx`, or `(group)/<segment>/_layout.tsx` such as `(docs)/docs/_layout.tsx` — now reaches the route's Suspense boundaries. The generated wrapper that takes that layout's place in the route stack re-exported `NotFound`, `Error` and `pageConfig` but not `Loading`, so the stage was dropped silently: a streamed render flushed the shell around an empty content area, painting the footer directly under the header until the page arrived.
