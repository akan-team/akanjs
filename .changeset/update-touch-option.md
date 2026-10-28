---
"akanjs": patch
---

Query-level writes take `{ touch: false }` to leave `updatedAt` as stored: `updateOne`, `updateMany` and `updateById` in their options, and the generated `update<Filter>` / `updateOne<Filter>` as `.set(update, { touch: false })`. A lease heartbeat or a mirrored snapshot written this way no longer shows up in `updatedAt` periods and sorts as an edit.
