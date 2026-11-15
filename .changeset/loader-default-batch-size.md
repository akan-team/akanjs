---
"akanjs": patch
---

A loader sends its store at most 500 distinct keys per query and splits a larger batch into several queries that run together. A `load<Model>Many` or a nested list with more ids than a database takes in one statement now loads instead of failing: Postgres refused more than 65,534 values, and SQLite refused a `byQuery` batch of about 1,000 keys.
