---
"@akanjs/devkit": patch
---

A module named in a library that lacks it, such as `akan create-view util:nope`, is refused at once, as one named in an app is. Before, it fell through to the module picker in a terminal, and without one it failed as if no module had been named. Both are now refused, terminal or not, with the modules there are and the line to rerun: ``Unknown module 'util:nope': util has no such module, so rerun it as `akan create-view <sys:module>` (choices: pokedex:card, util:photo).`` An app's used to say only `Invalid module name: nope`.
