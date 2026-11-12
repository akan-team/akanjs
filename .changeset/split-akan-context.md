---
"@akanjs/devkit": patch
---

Internal: `akan doctor` runs one check class per family under `context/doctor/` (`rootShapeCheck.ts`, `agentGuideCheck.ts`, `configLeftoverCheck.ts`, `moduleShapeCheck.ts`, `recipeDuplicateCheck.ts`, `recipeIndexCheck.ts`, collected by `doctorFindings.ts` and scoped by `workflowScope.ts` and `generatedFreshness.ts`), and `inspect_akan_context` answers each request type through `AkanContextInspection` in `context/akanContextInspection.ts`. The doctor's diagnostics, their order, codes, severities and repair actions, the `akan context` output and every MCP answer are unchanged, and `akanContext.ts` and `akanMcpContract.ts` export the same names.
