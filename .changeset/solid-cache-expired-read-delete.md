---
"akanjs": patch
---

On the SQLite cache, a value or hash field written by another process is no longer removed by a `get` or `hget` that saw the key's previous, expired entry.
