---
"@akanjs/cli": patch
"create-akan-workspace": patch
---

A new workspace's `package.json` no longer has the ten `agent:sample:*` scripts. In a `--sample false` workspace, `agent:sample:workflow:plan` planned a field on the `task` module, which that app does not have, and `agent:sample:workflow:dry-run` reported the plan as passed; only a real apply failed. `agent:sample:context`, `agent:sample:field` and `agent:sample:status` named a `project` module that no new app has, and four of the scripts scaffolded a module, a service or a field into the workspace. The `akan workflow`, `akan add-field`, `akan create-module` and `akan create-service` references already show these commands. The `sync`, `dev`, `lint`, `typecheck`, `test`, `build` and other `agent:*` scripts stay.
