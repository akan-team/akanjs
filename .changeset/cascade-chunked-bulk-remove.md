---
"akanjs": patch
---

A cascade that removes the documents a long array field references in one query now removes them 200 ids at a time inside one transaction, so a large array no longer runs past Postgres's bound-parameter limit or builds one huge statement on SQLite.
