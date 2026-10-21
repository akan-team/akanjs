---
"akanjs": patch
---

`AppProviderProps`, the props of `System.App`, is now exported. Without it, `akan build-package akanjs` failed while emitting declarations with TS4023: `System` could not name the type of its `App` member.
