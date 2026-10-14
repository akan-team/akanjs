---
"akanjs": patch
---

A `memory(...)` declared with a model or scalar class now reads back as an instance of that class, methods included, as its type says. Before, it read back as a plain object. Spreading such a value (`{ ...value }`) now drops its Date fields, which an instance keeps as prototype accessors, so copy it with `new cnst.X().set(value)`.
