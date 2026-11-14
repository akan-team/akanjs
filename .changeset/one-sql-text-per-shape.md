---
"akanjs": patch
---

Every page of a list is read with one SQL text: the page offset is a bound parameter, so paging no longer adds a prepared statement per page to the SQLite statement cache or to each Postgres connection. On Postgres a list of two or more values (`q.oneOf`, `q.notOneOf`, a raw table's `$in` and `$nin`) is bound as one array, so its length adds no prepared statement either, and a list past the 65,534 parameters one statement may bind is now read.
