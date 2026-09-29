---
"akanjs": patch
---

A CSR page renders when the app's root layout sits in a route group

- An app whose root layout is `page/(app)/_layout.tsx` rendered an empty `#root` on every CSR page — `?csr=true`,
  `/__csr` and native builds — with nothing in the console: the CSR route table left a route group's layout out of the
  root, so no route had a root layout, while the SSR route tree rendered the same pages fine.
- The CSR route table and the SSR route tree now place layouts through one rule, so a page gets the same root layouts
  on both sides. A grouped layout directly under the app's root layout (a `(tab)` group's) is a root layout in CSR
  too, as it already was in SSR.
- A route that still ends up with no root layout throws `[csr] no root layout for <path>` instead of rendering nothing.
