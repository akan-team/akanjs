---
"akanjs": patch
---

An index declared without a `name` is now named by its table and fields, with `_unique` for a unique index (`pcLog_removedAt_at`), never by its position. Before, the indexes made for a filter's sorts and for cascades came after every `_onSchema` index, so adding any index renamed them all, and each boot built the renamed ones again beside the old copies, which every write kept updating.

- An index akan built that nothing declares any more is dropped on the next boot. On Postgres it is dropped concurrently, without blocking the table. An index made by hand, outside akan, is never touched.
- After the upgrade, an index an earlier release built under its old name keeps serving as it is, without a rebuild. Its extra copies are dropped.
- Two declarations of the same index build it once. Two different indexes given the same `name` stop the boot.
