---
"@akanjs/cli": patch
"create-akan-workspace": patch
---

A new workspace, and an app from `akan create-application` or a library from `akan create-library`, now pass `akan doctor --strict` (the `agent:doctor` script). The app's or library's own service module, `lib/_<name>/`, was the only scaffolded module written without an abstract, so doctor answered `"status": "failed"` with `module-abstract-missing` before any code was written. The scaffold now writes a short `<name>.abstract.md` beside it: the module owns nothing yet, and `serverMode: "batch"` keeps it out of a `federation` replica, so an endpoint a page calls belongs in a module from `akan create-service`. Doctor still fails a module whose abstract is missing.
