import type { WorkflowSpec } from "@akanjs/devkit/workflow";
import { baseValidation, moduleInput, sysInputs } from "./shared";

export const addMutationWorkflowSpec: WorkflowSpec = {
  schemaVersion: 1,
  name: "add-mutation",
  description: "Plan a server mutation and matching signal/store/UI action surface.",
  whenToUse: "Use when the user asks for a new state-changing module action.",
  inputs: {
    ...sysInputs,
    ...moduleInput,
    mutation: { type: "string", required: true, description: "Mutation/action name." },
  },
  optionalSurfaces: {
    service: "include",
    signal: "include",
    store: "infer",
    util: "infer",
    unit: "infer",
    view: "infer",
    dictionary: "include",
  },
  steps: [
    {
      id: "inspect-module",
      title: "Inspect module",
      tool: "inspectModule",
      description: "Read service, signal, store, and UI action patterns.",
    },
    {
      id: "update-service",
      title: "Update service",
      tool: "updateServiceMutation",
      description: "Plan the server-side mutation method.",
    },
    {
      id: "update-signal",
      title: "Update signal",
      tool: "updateSignalMutation",
      description: "Plan the client/server signal mutation binding.",
    },
    {
      id: "update-action-surfaces",
      title: "Update action surfaces",
      tool: "updateActionSurfaces",
      description: "Plan optional store and UI action changes.",
    },
    {
      id: "sync-generated",
      title: "Sync generated files",
      tool: "syncTarget",
      description: "Refresh generated service and signal barrels.",
    },
    {
      id: "validate-target",
      title: "Validate target",
      tool: "lintTarget",
      description: "Run validation commands for the target.",
    },
  ],
  predictedChanges: [
    {
      target: "*/lib/<module>/<module>.service.ts",
      action: "modify",
      applyScope: "auto",
      reason: "Service mutation method stub is added.",
    },
    {
      target: "*/lib/<module>/<module>.signal.ts",
      action: "modify",
      applyScope: "auto",
      reason: "Signal endpoint mutation is added.",
    },
    { target: "*/lib/srv.ts", action: "sync", reason: "Generated service barrel may change after sync." },
    { target: "*/lib/sig.ts", action: "sync", reason: "Generated signal barrel may change after sync." },
  ],
  validation: [
    ...baseValidation,
    {
      command: "akan typecheck <app-name>",
      reason: "Validate mutation contracts across service and signal.",
      kind: "typecheck",
    },
  ],
  completionCriteria: ["Service and signal contracts align.", "Generated files are refreshed.", "Validation passes."],
};
