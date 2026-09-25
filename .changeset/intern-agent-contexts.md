---
"akanjs": patch
---

Intern the in-page agent's React contexts on `globalThis`, so a zone's tools reach the zone's session.

An akan build inlines `use-agentic` into every client bundle that reaches it — four of them in this repo's own
docs app — and a React context is identified by object identity. `AgenticSurface.shared` already survives that on
a `Symbol.for` key; `SurfaceContext`, `ScopeContext` and `SessionContext` did not. So the `ScopeContext.Provider`
an `Agent.Zone` rendered from one copy was invisible to the `st.tool` / `st.expose` / form tools reading it from
another: `useScopePath()` fell back to `[]`, every declared tool registered at the root scope, and the zone
session then filtered out all of them as belonging to a different view. The model was handed the built-ins and
answered `Unknown tool` for tools the screen had published — with nothing thrown and nothing logged.

All three now go through one `sharedContext` helper, and a test fails if any module in the package makes a
context the plain way: the plain call works in the monorepo, where there is one copy, and breaks only once
bundled, so using the feature cannot catch it.
