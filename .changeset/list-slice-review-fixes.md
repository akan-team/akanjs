---
"akanjs": patch
---

`setLimitOf<Model>(0)` called on page 2 or later lists every row from page 1. It used to set `pageOf<Model>` to `Infinity`, which a later `setLimitOf<Model>(20)` turned into `NaN`, and live rows were no longer placed. A `limit: 0` list holding fewer rows than its count, because the server lists at most 500 rows for it, no longer places a live row that sorts past its last row; it marks the slice stale instead.
