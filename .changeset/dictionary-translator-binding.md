---
"@akanjs/devkit": patch
---

A variable or parameter that only shares the translator's name no longer sends a route to the whole page dictionary. `values.map((l) => l.trim())`, `rows.sort((l, r) => l.order - r.order)`, `const l = line.length` and a `for (const l of lines)` loop are read as the plain values they are, so a file holding one keeps its routes on the dictionary groups they show. A name that may be the translator still counts as it: one destructured from an object, imported or not declared in the file, and any parameter or variable that is called, read through `l._`, `l.rich` or `l.trans`, or given another value.
