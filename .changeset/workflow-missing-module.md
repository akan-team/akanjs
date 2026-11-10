---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`akan workflow plan` and the `plan_workflow` MCP tool refuse a module the target app or library lacks, for every workflow that writes into an existing module (`add-field`, `add-enum-field`, `add-mutation`, `add-slice`, `create-ui`, `rename-key`). The `workflow-module-missing` error names the module, lists the modules the target has, and points at the module whose name differs only in case or by a leading `_`, at a scalar of that name, or at the app or library that holds it; only when none exists does it point at `create-module`. Before, the plan passed and its dry run reported `passed`. `add-mutation` used to plan a missing module with a warning so that a `create-module` plan could precede it; it now refuses too, so plan it after applying `create-module`. Every workflow now refuses an unknown `app` at plan time, listing the workspace's apps and libraries. `apply` and `--dry-run` check the target again before anything else, so a plan written earlier for a module that is gone fails instead of passing. `plan_workflow` now inspects the MCP server's workspace rather than the process directory.
