---
"@akanjs/cli": patch
---

`create-module` scaffolds the `inPublic` slice with a `.desc()` in the dictionary, so a new module no longer boots with `MCP exposed "<model>ListInPublic" with no description`, and its `<Model>.Util.Remove` lays the icon and the label in a row: `Model.Remove`'s trigger is a block, where an icon stacked over the text.
