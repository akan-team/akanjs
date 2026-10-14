---
"@akanjs/devkit": patch
---

The generated barrels (`cnst`, `db`, `dict`, `sig`, `st`, and the facet indexes) list modules in name order instead of the order the filesystem returns them, so two machines building the same commit produce the same CSR bundle. A store action or state key that two stores both define was decided by that order; it is now decided by module name.
