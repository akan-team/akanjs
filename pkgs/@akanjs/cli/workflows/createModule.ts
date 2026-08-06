import type { WorkflowSpec } from "@akanjs/devkit/workflow";
import { baseValidation, sysInputs } from "./shared";

export const createModuleWorkflowSpec: WorkflowSpec = {
  schemaVersion: 1,
  name: "create-module",
  description: "Plan a new database-backed domain module using Akan module conventions.",
  whenToUse: "Use when the user asks for a new business entity with constant, service, signal, store, and UI surfaces.",
  inputs: {
    ...sysInputs,
    module: { type: "string", required: true, description: "Name of the module to create." },
  },
  optionalSurfaces: {
    page: "infer",
    template: "include",
    unit: "include",
    view: "include",
  },
  steps: [
    {
      id: "inspect-system",
      title: "Inspect target system",
      tool: "inspectSystem",
      description: "Check the target app or library before planning new module files.",
    },
    {
      id: "create-module",
      title: "Create module",
      tool: "createModule",
      description: "Use the existing create-module primitive to scaffold conventional module files.",
    },
    {
      id: "sync-generated",
      title: "Sync generated files",
      tool: "syncTarget",
      description: "Refresh generated barrels after adding a module.",
    },
    {
      id: "validate-target",
      title: "Validate target",
      tool: "lintTarget",
      description: "Run validation commands that prove the scaffold matches Akan conventions.",
    },
  ],
  predictedChanges: [
    { target: "*/lib/<module>/*", action: "create", reason: "New module source files are scaffolded." },
    { target: "*/lib/cnst.ts", action: "sync", reason: "Generated constant barrel may include the new module." },
    { target: "*/lib/srv.ts", action: "sync", reason: "Generated service barrel may include the new module." },
    { target: "*/lib/sig.ts", action: "sync", reason: "Generated signal barrel may include the new module." },
  ],
  validation: baseValidation,
  completionCriteria: [
    "Module abstract and conventional files exist.",
    "Generated files are refreshed with sync.",
    "Lint passes for the target.",
  ],
};
