---
"akanjs": patch
---

`Agent.Chat`, `Select` and `Data.ListContainer` are split internally into named hooks and sub-components that stay in their original three files. Nothing new is exported, and behaviour, rendered markup and render counts are unchanged.
