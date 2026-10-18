---
"akanjs": patch
---

A cascade skips a referenced document that is already removed instead of failing. Two owners can hold one `File`, since files are deduped by `origin`. Removing the first owner removes the file; removing the second used to call `remove` on it again, throw `NoDocumentError` and leave the rest of that owner's files and children in place. Each per-document `removeRef` edge now asks which of its ids are still live, 200 ids per query, and removes only those.
