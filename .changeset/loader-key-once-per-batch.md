---
"akanjs": patch
---

A loader asks its store for each key once per batch: loads of the same key in one batch share one lookup, and each caller still gets its own document wherever the loader has `copy`, as every model and declared loader does. A `new DataLoader(...)` without `copy` now hands the callers of a repeated key one result object, where a batch function that built a fresh object per position gave each its own: pass `copy` to keep them apart. A batch function that throws, or resolves to something that is not an array, now rejects its callers instead of leaving them waiting.
