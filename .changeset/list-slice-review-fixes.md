---
"akanjs": patch
---

`setLimitOf<Model>(0)` called on page 2 or later lists every row from page 1. It used to set `pageOf<Model>` to `Infinity`, which a later `setLimitOf<Model>(20)` turned into `NaN`, and live rows were no longer placed. A `limit: 0` list holding fewer rows than its count, because the server lists at most 500 rows for it, no longer places a live row that sorts past its last row; it marks the slice stale instead.

`Model.LoadInit` renders nothing, as documented. It used to draw a pager when its slice held more rows than its limit, publish a page tool to the in-page agent, and on a touch screen load the next page into the shared slice by itself, so every list reading that slice showed the extra rows. A slice loaded with `{ insight: false }` also keeps that choice, held in the new `hasInsightOf<Model>` state, until the next `init<Model>()`: a `Load.Units` refetch, `refresh<Model>()` and `setQueryArgsOf<Model>()` no longer count its rows, so a pager the first render did not draw no longer appears.
