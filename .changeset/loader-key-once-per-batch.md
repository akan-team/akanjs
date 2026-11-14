---
"akanjs": patch
---

A loader asks its store for each key once per batch: loads of the same key in one batch share one lookup, and each caller still gets its own document. A batch function that throws now rejects its callers instead of leaving them waiting.
