---
"akanjs": patch
---

A page that uses no store no longer loads immer.

`akanjs/constant` imported immer only for its `immerable` marker, and `akanjs/client` and `akanjs/fetch` reach
`akanjs/constant`, so every page of every app downloaded immer (about 4.4 KB of brotli JS) whether or not it had a
store to draft. A constant now marks itself with the same registry symbol immer reads, `Symbol.for("immer-draftable")`,
without importing immer, which now reaches the browser only with `akanjs/store`. The empty page of
`apps/groupedroot` drops from 175.6 KB to 171.2 KB in the same 34 files.

Nothing changes for an app: a model instance is draftable by `produce`, `st.set` and the form setters as before, and
a route that loads the store loads immer with it.
