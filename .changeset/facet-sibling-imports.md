---
"akanjs": patch
---

No non-test file in an `akanjs` facet imports its own facet's barrel any more; each imports the sibling file that declares what it uses. Four value imports in `constant/` went through its barrel, so loading one of those files loaded the whole facet first. `ResolveFieldContext` moved to `signal/resolveFieldContext.ts`, and `akanjs/signal` still exports it. Every public import is unchanged.
