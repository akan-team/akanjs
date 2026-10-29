---
"akanjs": patch
---

The fetch client no longer drops a custom endpoint named like another model's generated CRUD endpoint (`removeX`, `updateX`, `viewX`, …) when that model's slice does not mount the verb. A slice now takes back only the generated handlers it registered itself, so the result no longer depends on which module the client applied first.
