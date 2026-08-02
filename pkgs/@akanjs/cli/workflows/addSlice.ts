import type { WorkflowSpec } from "@akanjs/devkit/workflow";
import { baseValidation, moduleInput, sysInputs } from "./shared";

export const addSliceWorkflowSpec: WorkflowSpec = {
  schemaVersion: 1,
  name: "add-slice",
  description: "Plan a list/query slice across data access, signal, and view surfaces.",
  whenToUse: "Use when the user asks for a filtered list, tab, segment, or reusable query slice.",
  inputs: {
    ...sysInputs,
    ...moduleInput,
    slice: { type: "string", required: true, description: "Slice or query name." },
  },
  optionalSurfaces: {
    service: "include",
    signal: "include",
    zone: "infer",
    page: "infer",
    dictionary: "include",
  },
  steps: [
    {
      id: "inspect-module",
      title: "Inspect module",
      tool: "inspectModule",
      description: "Read existing query, slice, zone, and page loading patterns.",
    },
    {
      id: "update-service-query",
      title: "Update service query",
      tool: "updateServiceSlice",
      description: "Plan the query helper or filter handling.",
    },
    {
      id: "update-signal-slice",
      title: "Update signal slice",
      tool: "updateSignalSlice",
      description: "Plan the signal slice contract.",
    },
    {
      id: "connect-view-surfaces",
      title: "Connect view surfaces",
      tool: "connectSliceSurfaces",
      description: "Plan optional Zone and page loader changes.",
    },
    {
      id: "sync-generated",
      title: "Sync generated files",
      tool: "syncTarget",
      description: "Refresh generated files after slice changes.",
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
      reason: "Query helper method stub is added.",
    },
    {
      target: "*/lib/<module>/<module>.signal.ts",
      action: "modify",
      applyScope: "auto",
      reason: "Signal slice entry is added.",
    },
    {
      target: "*/lib/<module>/<Module>.Zone.tsx",
      action: "modify",
      applyScope: "manual-review",
      reason: "Zone may connect slice state.",
    },
    { target: "*/lib/sig.ts", action: "sync", reason: "Generated signal barrel may change after sync." },
  ],
  validation: [
    ...baseValidation,
    {
      command: "akan build <app-name>",
      reason: "Validate page and list surfaces when a slice changes app behavior.",
      kind: "custom",
    },
  ],
  completionCriteria: [
    "Slice query and signal shape align.",
    "Optional view surfaces are planned.",
    "Validation passes.",
  ],
};
