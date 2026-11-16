---
"@akanjs/devkit": patch
---

A stylesheet whose imports use no Tailwind (no `@import "tailwindcss"`, Tailwind at-rule or `theme()` function anywhere in its import graph) is no longer run through the Tailwind compiler: its imports are inlined and it ships without the `/*! tailwindcss … */` banner. A stylesheet that uses Tailwind compiles exactly as before.
