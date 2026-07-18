import type { WorkflowSpec } from "@akanjs/devkit";
import { baseValidation, sysInputs } from "./shared";

export const createScalarWorkflowSpec: WorkflowSpec = {
  schemaVersion: 1,
  name: "create-scalar",
  description: "Plan a reusable scalar value module without database ownership.",
  whenToUse: "Use when the user asks for a reusable value object, primitive domain type, or shared scalar.",
  inputs: {
    ...sysInputs,
    scalar: { type: "string", required: true, description: "Name of the scalar to create." },
  },
  optionalSurfaces: {
    dictionary: "include",
  },
  steps: [
    {
      id: "inspect-system",
      title: "Inspect target system",
      tool: "inspectSystem",
      description: "Check the target app or library before planning a scalar.",
    },
    {
      id: "create-scalar",
      title: "Create scalar",
      tool: "createScalar",
      description: "Use the existing create-scalar primitive to scaffold scalar files.",
    },
    {
      id: "sync-generated",
      title: "Sync generated files",
      tool: "syncTarget",
      description: "Refresh generated barrels after adding a scalar.",
    },
    {
      id: "validate-target",
      title: "Validate target",
      tool: "lintTarget",
      description: "Run validation commands for the scalar target.",
    },
  ],
  predictedChanges: [
    { target: "*/lib/__scalar/<scalar>/*", action: "create", reason: "New scalar source files are scaffolded." },
  ],
  validation: baseValidation,
  completionCriteria: ["Scalar files exist under __scalar.", "Generated files are refreshed.", "Lint passes."],
};
