---
"akanjs": patch
---

An app's or lib's typecheck no longer fails with TS7016 on `react-server-dom-webpack/client.node` once an install
links the package into `akanjs`: the SSR renderer references the ambient declarations it needs itself.
