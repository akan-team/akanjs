---
"akanjs": patch
---

A model's `bulkWrite` now runs its operations in one transaction, so an operation that fails leaves none of the batch applied; called inside an open transaction, it joins that one.

**Upgrading.** `bulkWrite` used to keep the operations before the one that failed, as MongoDB's ordered `bulkWrite` does. Code that relied on those earlier writes surviving a failure should split the batch, or catch per operation with `updateOne`.
