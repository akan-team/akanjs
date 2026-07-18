import type { WorkflowSpec } from "@akanjs/devkit";
import { baseValidation, moduleInput, sysInputs } from "./shared";

export const createUiWorkflowSpec: WorkflowSpec = {
  schemaVersion: 1,
  name: "create-ui",
  description: "Plan creation of a conventional module UI surface.",
  whenToUse: "Use when the user asks for a View, Unit, Template, Zone, or Util component for an existing module.",
  inputs: {
    ...sysInputs,
    ...moduleInput,
    surface: {
      type: "string",
      required: true,
      description: "UI surface to create.",
      allowedValues: ["view", "unit", "template", "zone", "util"],
    },
  },
  optionalSurfaces: {
    dictionary: "infer",
    store: "infer",
  },
  steps: [
    {
      id: "inspect-module",
      title: "Inspect module",
      tool: "inspectModule",
      description: "Read existing module context and component files.",
    },
    {
      id: "create-ui",
      title: "Create UI surface",
      tool: "createUi",
      description: "Create the requested UI surface through an Akan primitive.",
    },
    {
      id: "sync-generated",
      title: "Sync generated files",
      tool: "syncTarget",
      description: "Refresh UI barrels after adding a component.",
    },
    {
      id: "validate-target",
      title: "Validate target",
      tool: "lintTarget",
      description: "Run validation commands for the target.",
    },
  ],
  predictedChanges: [
    { target: "*/lib/<module>/<Module>.<Surface>.tsx", action: "create", reason: "New UI component is created." },
    { target: "*/ui/index.ts", action: "sync", reason: "Generated UI barrel may include the new component." },
  ],
  validation: baseValidation,
  completionCriteria: ["Requested UI surface exists.", "UI barrels are refreshed.", "Lint passes."],
};
