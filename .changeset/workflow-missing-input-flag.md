---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

A workflow plan that lacks a required input now names the flag to pass and the inputs it was given but does not take.

`akan workflow plan create-scalar --app shop --module address` used to answer `requires input "scalar"` and drop `--module` without a word. It now answers `Workflow create-scalar requires input "scalar" (--scalar on the command line). It does not take "module", which was passed.` The `plan_workflow` tool of `akan mcp` returns the same message.
