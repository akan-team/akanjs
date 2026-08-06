import type { WorkflowSpec } from "@akanjs/devkit/workflow";
import { baseValidation, moduleInput, sysInputs } from "./shared";

export const addEnumFieldWorkflowSpec: WorkflowSpec = {
  schemaVersion: 1,
  name: "add-enum-field",
  description: "Plan an enum field addition with option and dictionary coverage.",
  whenToUse: "Use when the user asks to add a field with a closed set of values.",
  inputs: {
    ...sysInputs,
    ...moduleInput,
    field: { type: "string", required: true, description: "Name of the enum field to add." },
    values: { type: "string-list", required: true, description: "Comma-separated enum values." },
    default: { type: "string", description: "Optional default enum value." },
  },
  optionalSurfaces: {
    dictionary: "include",
    option: "include",
    template: "infer",
    unit: "infer",
    view: "infer",
    store: "infer",
  },
  steps: [
    {
      id: "inspect-module",
      title: "Inspect module",
      tool: "inspectModule",
      description: "Read module files and existing enum conventions.",
    },
    {
      id: "update-constant",
      title: "Update enum field",
      tool: "updateConstantEnumField",
      description: "Plan enum type and field shape changes.",
    },
    {
      id: "update-dictionary",
      title: "Update dictionary",
      tool: "updateDictionaryEnum",
      description: "Plan enum labels and field labels.",
    },
    {
      id: "update-option",
      title: "Update options",
      tool: "updateOptionEnum",
      description: "Plan option entries used by UI controls.",
    },
    {
      id: "sync-generated",
      title: "Sync generated files",
      tool: "syncTarget",
      description: "Refresh generated files after enum source changes.",
    },
    {
      id: "validate-target",
      title: "Validate target",
      tool: "lintTarget",
      description: "Run validation commands for the target.",
    },
  ],
  predictedChanges: [
    { target: "*/lib/<module>/<module>.constant.ts", action: "modify", reason: "Enum field shape is added." },
    { target: "*/lib/<module>/<module>.dictionary.ts", action: "modify", reason: "Enum labels are added." },
    { target: "*/lib/<module>/<module>.option.ts", action: "modify", reason: "Enum options may be added." },
  ],
  validation: [
    ...baseValidation,
    { command: "akan typecheck <app-name>", reason: "Validate enum usage across module surfaces.", kind: "typecheck" },
  ],
  completionCriteria: ["Enum values are represented.", "Labels and options exist.", "Sync, lint, and typecheck pass."],
};
