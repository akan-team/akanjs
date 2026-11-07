---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`akan workflow apply` of `add-enum-field`, or of `add-field --type enum`, works on the sample `task` module a new workspace ships. Before, it failed with `primitive-post-edit-dictionary-verify-failed` and wrote nothing, because the dictionary's header comment names `.error()` and the enum block landed inside that comment. The enum block now goes before the dictionary chain's own `.error()` or `.translate()` stage, or at the chain's end.

`akan workflow plan add-field` takes `--surfaces template,unit` and `--include-in-light`, the two inputs `akan workflow explain add-field` lists. Explain now also prints the flag beside each camelCase input, such as `` `includeInLight` (`--include-in-light`) ``.
