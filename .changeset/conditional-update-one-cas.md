---
"akanjs": patch
"@akanjs/cli": patch
---

A conditional `updateOne` / `removeOne` (`updateOneByQuery`, `removeOneByQuery` and the generated `updateOne<Filter>` / `removeOne<Filter>`) is a compare-and-set on Postgres too: of two concurrent calls that both read the row as matching, only one applies and reports `modifiedCount: 1`. Before, Postgres re-checked a row another write had just changed without the query's condition, so both applied — a balance guarded by `balance >= amount` could go negative.
