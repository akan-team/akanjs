import type { WorkflowSpec } from "@akanjs/devkit/workflow";
import { baseValidation, moduleInput, sysInputs } from "./shared";

export const addFieldWorkflowSpec: WorkflowSpec = {
  schemaVersion: 1,
  name: "add-field",
  description: "Plan a field addition across domain and selected UI surfaces.",
  whenToUse: "Use when the user asks to add a new field to an existing domain module.",
  inputs: {
    ...sysInputs,
    ...moduleInput,
    field: { type: "string", required: true, description: "Name of the field to add." },
    type: {
      type: "string",
      required: true,
      description:
        "Field type or scalar name. Use Int for integer fields or Float for decimal fields; do not use Number.",
    },
    values: { type: "string-list", description: "Comma-separated enum values when type is enum." },
    default: {
      type: "string",
      description:
        "Optional default value. plan/apply coerce by field type: Int/Float to numeric literals, Boolean to true/false, Date to new Date(...), String/scalar to string literals, and enum only when the value is in values.",
    },
    surfaces: {
      type: "string-list",
      description:
        "Optional UI surfaces to update, comma-separated. Use template to auto-update simple generated Template forms; View/Unit stay planned as manual review.",
    },
    includeInLight: {
      type: "boolean",
      description: "Whether to add the field to the Light<Model> projection used by list/card displays.",
    },
  },
  optionalSurfaces: {
    dictionary: "include",
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
      description: "Read module files and detect existing field/UI patterns.",
    },
    {
      id: "update-constant",
      title: "Update constant",
      tool: "updateConstantField",
      description: "Plan the source-of-truth field shape change.",
    },
    {
      id: "update-dictionary",
      title: "Update dictionary",
      tool: "updateDictionaryField",
      description: "Plan field labels and user-facing text.",
    },
    {
      id: "update-ui-surfaces",
      title: "Update UI surfaces",
      tool: "updateUiSurfaces",
      description: "Plan optional Template, Unit, View, and Store updates according to inferred surfaces.",
      when: "optionalSurfaces.* is include or infer",
    },
    {
      id: "sync-generated",
      title: "Sync generated files",
      tool: "syncTarget",
      description: "Refresh generated files after source changes.",
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
      target: "*/lib/<module>/<module>.constant.ts",
      action: "modify",
      applyScope: "auto",
      reason: "Field shape is added.",
    },
    {
      target: "*/lib/<module>/<module>.dictionary.ts",
      action: "modify",
      applyScope: "auto",
      reason: "Field label is added.",
    },
    {
      target: "*/lib/<module>/<Module>.Template.tsx",
      action: "modify",
      applyScope: "manual-review",
      reason: "Form surface may include the field.",
    },
    {
      target: "*/lib/cnst.ts",
      action: "sync",
      applyScope: "generated-sync",
      reason: "Generated constants may change after sync.",
    },
    {
      target: "*/lib/dict.ts",
      action: "sync",
      applyScope: "generated-sync",
      reason: "Generated dictionary barrel may change after sync.",
    },
  ],
  validation: [
    ...baseValidation,
    {
      command: "akan typecheck <app-name>",
      reason: "Validate cross-surface TypeScript contracts after field changes.",
      kind: "typecheck",
    },
  ],
  completionCriteria: [
    "Field exists in source-of-truth module shape.",
    "Dictionary labels cover the field.",
    "Generated files are refreshed.",
    "Lint and typecheck pass.",
  ],
};
