---
"akanjs": patch
---

The database statement metrics no longer freeze the server at 100% CPU. One statement sent by a seventeenth endpoint when no untraced call had sent it before, or a ninth text of one query shape in local dev's plan check, made the counter call itself with the same arguments forever, with no error or log. Senders past sixteen are counted in one `other` slot and texts past eight share one plan, as intended.
