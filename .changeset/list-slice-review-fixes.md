---
"akanjs": patch
---

`setLimitOf<Model>(0)` called on page 2 or later lists every row from page 1. It used to set `pageOf<Model>` to `Infinity`, which a later `setLimitOf<Model>(20)` turned into `NaN`, and live rows were no longer placed. In the 3.1.0 release candidates, a `limit: 0` list holding fewer rows than its count, because the server lists at most 500 rows for it, placed a live row that sorts past its last row at its end; it now marks the slice stale instead.

`Model.LoadInit` renders nothing, as documented. It used to draw a pager when its slice held more rows than its limit, publish a page tool to the in-page agent, and on a touch screen load the next page into the shared slice by itself, so every list reading that slice showed the extra rows. A slice loaded with `{ insight: false }` also keeps that choice, held in the new `hasInsightOf<Model>` state, until the next `init<Model>()`: a `Load.Units` refetch, `refresh<Model>()` and `setQueryArgsOf<Model>()` no longer count its rows, so a pager the first render did not draw no longer appears.

A `.live()` slice keeps its lists current in three cases where they went quiet. Its room now stays open until the last `Load.Units` or `Model.LoadInit` showing the slice unmounts; the first one to unmount used to close it for every list. A list shown again from a CSR stack refetches when its room closed while it was hidden, instead of keeping rows that missed the writes made meanwhile. A row that arrives while a list loads makes the load read its rows once more, where it used to stay missing until the list next reloaded.

A `Load.Units` shown again from a CSR stack shows its own rows. When the page pushed over it read the same slice with other arguments, the list kept that page's rows and live room after going back, and made no list call; it now reloads the arguments, page, limit and sort it showed. A list whose slice another list on the same screen took over does the same once that list unmounts. A refetch, page change or `loadMoreOf<Model>()` still in flight when another `Load.Units` seeds the slice no longer writes its rows over the seeded ones.
