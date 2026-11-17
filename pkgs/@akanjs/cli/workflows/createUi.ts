import type { WorkflowSpec } from "@akanjs/devkit/workflow";
import { baseValidation, inspectModuleStep, syncGeneratedStep, sysInputs, validateTarget } from "./shared";

export const createUiWorkflowSpec: WorkflowSpec = {
  schemaVersion: 1,
  name: "create-ui",
  description: "Plan creation of a conventional module UI surface.",
  whenToUse: "Use when the user asks for a View, Unit, Template, Zone, or Util component for an existing module.",
  inputs: {
    ...sysInputs,
    module: {
      type: "string",
      required: true,
      description:
        "An existing database module, one with lib/<module>/<module>.constant.ts; or, for zone and util only, a service module, named with or without its leading underscore. Not a scalar module.",
      mustExist: true,
    },
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
    inspectModuleStep("Read existing module context and component files."),
    {
      id: "create-ui",
      title: "Create UI surface",
      tool: "createUi",
      description: "Create the requested UI surface through an Akan primitive.",
    },
    syncGeneratedStep("Refresh UI barrels after adding a component."),
    validateTarget,
  ],
  predictedChanges: [
    { target: "*/lib/<module>/<Module>.<Surface>.tsx", action: "create", reason: "New UI component is created." },
    { target: "*/ui/index.ts", action: "sync", reason: "Generated UI barrel may include the new component." },
  ],
  validation: baseValidation,
  completionCriteria: ["Requested UI surface exists.", "UI barrels are refreshed.", "Lint passes."],
};
