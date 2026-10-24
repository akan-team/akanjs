---
"akanjs": minor
---

A model's rows can now be deleted for good. `purge<Filter>(...args)` is generated beside `remove<Filter>` for every filter, and the table facade gains `purgeMany(query)`. Both delete every row the query matches and return how many were deleted. They are meant for data past its retention, such as logs.

- They reach removed rows too, unlike every other query-level write, so `{ createdAt: q.lt(cutoff) }` clears a cutoff's live and removed rows alike, and `{ removedAt: q.lt(cutoff) }` clears old removals.
- Each row's text-search mirror goes with it. No hook, cascade or live room runs, and there is no undo.
- Rows are deleted 1,000 per statement in every database mode, so a large purge never holds the SQLite write lock for long. Between batches the purge waits one timer turn, so other requests in the same process can write.
- A query that matches every row (`{}`, an empty `q.all()`, a filter whose `q.when` conditions all fell through) is refused, as is one with `q.search()`.
