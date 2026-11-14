---
"akanjs": patch
---

Every page of a list is read with one SQL text: the page offset is a bound parameter, so paging no longer adds a prepared statement per page to the SQLite statement cache or to each Postgres connection.
