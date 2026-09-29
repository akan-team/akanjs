---
"akanjs": patch
---

A CSR page renders when the app's root layout sits in a route group, inside the layouts that wrap it

- An app whose root layout is `page/(app)/_layout.tsx` rendered an empty `#root` on every CSR page — `?csr=true`,
  `/__csr` and native builds — with nothing in the console: the CSR route table left a route group's layout out of the
  root, so no route had a root layout, while the SSR route tree rendered the same pages fine.
- The CSR route table and the SSR route tree now place layouts through one rule: the root layout is the first root
  boundary the page generator writes a `__root_layout` for, the one that carries `System.Provider`. Every layout below
  it — `(app)/(public)/_layout.tsx`, a nested boundary such as a `(tab)` group's — wraps the pages. In CSR that is what
  keeps a lock screen or a nav in `(public)/_layout.tsx` around the page instead of in the provider's hidden container.
  SSR renders the same element tree as before; those layouts' route segments are now keyed as layouts, not roots.
- A route that still ends up with no root layout throws `[csr] no root layout for <path>` instead of rendering nothing.
