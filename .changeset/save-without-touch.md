---
"akanjs": patch
---

The document path takes `{ touch: false }` too: `doc.save({ touch: false })`, `pickAndWrite(id, data, { touch: false })` and `pickOneAndWrite(query, data, { touch: false })` keep `updatedAt` as stored while the save hooks, and so live sync, still run. A save that changes nothing re-sends the row to every room holding it without stamping an edit.
