---
"akanjs": patch
---

fix: make the admin panel's own controls work, and give the data surface a look

`Model.AdminPanel` is the one component an app mounts to get a model's whole admin surface, and most of what it
put on screen did nothing.

**The dashboard crashed the panel on every app that has no `summary` state.** `AdminPanel` always passed a
`renderDashboard`, and `ListContainer` read the tiles it needs through `st.use.summary()` — an app-level store key,
not a generated one — so the accessor was `undefined` and calling it took the route down. It now reads the key off
the state through `st.sel`, which is one hook whether or not the key exists, and `AdminPanel` defaults a dashboard
only when `summaryColumns` names something to put in it.

**A summary tile never rendered even where the state existed.** `AdminPanel` declared a `queryMap` prop and passed
`{}` in its place, and `Dashboard` skipped every column the map did not name. The map is forwarded, and it now
decides whether a tile *links* to its filtered listing rather than whether the tile exists at all. The tile is also
no longer an `<a>` inside a `<button>`.

**The sort selector was permanently empty.** It read `fetch.<model>SortKeys`, which nothing defines, and labelled
the options with a dictionary key one level short of the real one. Sort keys now travel with the serialized signal
(`FetchSerializer` emits `filter.sortKeys`, which `FetchClient` already knew how to merge and register), the
selector reads `fetch.sortKeyMap`, and a label that misses the dictionary falls back to the humanized key instead of
printing `user.latest` at the reader.

**`query`, `init`, and `sort` were dead props.** The init effect called `init<Model>()` with no arguments at all.
It now fills every slice argument before the init form, which is the only order the generated action reads
correctly — passing the form into an unfilled positional slot made it the query.

Also: an `Export CSV` that emitted tab-separated JSX (`[object Object]` for any column with a renderer) is real,
escaped, BOM-prefixed CSV read from the column's `value`; a card column with no `.length` — every number, every
date — renders instead of silently vanishing; a table header with no dictionary entry reads `Created At` instead of
`user.createdAt`; an empty card list says so instead of rendering nothing; a table keeps its rows while refreshing
instead of flashing its empty state; and the toolbar, tiles, and cards are rebuilt on the semantic tokens with a
card/table toggle, so the panel looks like the rest of the framework.
