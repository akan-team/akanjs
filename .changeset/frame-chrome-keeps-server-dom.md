---
"akanjs": patch
---

Frame chrome on an SSR page keeps the DOM the server drew: `Layout.Navbar`, `TopInset`, `TopLeftAction` and `BottomInset` hydrate where the server put them, in their slot's box, and that same DOM then moves into the frame slot instead of being remounted there. Text typed into the chrome before hydration, the focus and the caret survive hydration, and the chrome's state and effects no longer start over. While a page shows top chrome, an empty top slot is transparent and lets clicks through after hydration too, not only before it, so an empty top-left action slot no longer swallows clicks at the start of the bar. `Portal` no longer takes `fallback`.
