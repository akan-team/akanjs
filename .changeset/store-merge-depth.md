---
"akanjs": patch
---

`StoreRegistry.build` now reads a root store's state, actions and slices from the merged type rather than inferring them back out of it. That inference grew quadratically with the number of stores. In an app merging about 70 stores, `build` took most of the typecheck, and adding a few more stores failed it with TS2589 ("Type instantiation is excessively deep"). With this change the typecheck cost grows linearly with the store count, and the `st` type is unchanged.
