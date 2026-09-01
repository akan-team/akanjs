---
"akanjs": patch
---

fix: a `_overrides.tsx` manifest reaches what the root layout renders, and what an overlay host renders for it

**The override provider was mounted inside the root-layout stream, so the two most common positions a component
is rendered from were beyond every manifest's reach.** Route rendering composes
`[...renderRootLayouts, ...renderLayouts]`, and the override render rode the second stream — so a root-boundary
layout wrapped the provider instead of sitting inside it. Anything such a layout renders beside `{children}` (an
agent chat, a dock, a shell control) resolved every slot to its framework default, and so did anything drawn
through the overlay host that layout mounts, which is where a portalled `Modal` renders. Both failed silently:
the provider was mounted, with the right slot map, one level too deep.

Root boundaries are `/`, `/:lang` and `/:lang/<basePath>`, and a route **group adds no path segment**, so
`page/_layout.tsx` and `page/(group)/_layout.tsx` are both root layouts — which is exactly where the framework's
own guidance says to mount `<Agent.Chat />`.

**Overrides now wrap the whole stack, root layouts included.** `renderRootLayouts` is composed as
`[...overrideRenders, ...rootLayoutStack]` and the CSR/mobile builder mirrors it. Nested manifests still stack in
node order, so the closest declaration wins; the recursion carries the override-free root-layout array, because
the root-boundary test counts its length. No route type or segment-identity change: overrides ride the stream the
client already labels `"root-layout"`.

The regression tests assert the **resolved output** of a route whose root layout — and, separately, whose
route-group layout — renders a slot-bound component. Asserting that the provider is an ancestor would not have
caught this: it was.
