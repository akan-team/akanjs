---
"akanjs": patch
---

An index that two declarations build together, such as `{ code: 1 }` and `{ code: -1 }`, or a filter's sort and its reverse, is no longer rebuilt when the declarations trade places. Before, reordering them, or a rolling deploy that mixed two releases listing them in different orders, logged "changed its descriptor and is rebuilt" and built the whole index again at boot.
