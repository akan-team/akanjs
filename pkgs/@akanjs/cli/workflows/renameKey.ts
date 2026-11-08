import type { WorkflowSpec } from "@akanjs/devkit/workflow";
import { baseValidation, inspectModuleStep, moduleInput, syncGeneratedStep, sysInputs, validateTarget } from "./shared";

export const renameKeyWorkflowSpec: WorkflowSpec = {
  schemaVersion: 1,
  name: "rename-key",
  description: "Rename a slice key or a Filter query key together with every name derived from it.",
  whenToUse:
    "Use when the user renames a slice (inPublic) or a query (byName). A field, method or endpoint keeps its name in every use, so TypeScript's rename covers it.",
  inputs: {
    ...sysInputs,
    ...moduleInput,
    slice: { type: "string", description: "Slice key to rename; give this or query." },
    query: { type: "string", description: "Filter query key to rename; give this or slice." },
    to: { type: "string", required: true, description: "New key, camelCase." },
  },
  steps: [
    inspectModuleStep("Index the workspace and find the key with every derived name that resolves to it."),
    {
      id: "rename-key",
      title: "Rename key",
      tool: "renameKey",
      description:
        "Rewrite the key, its derived names in the app and every lib, and its module dictionary entry. A use that could also be another model's is left for the typecheck to report.",
    },
    syncGeneratedStep("Refresh generated files after the rename."),
    validateTarget,
  ],
  predictedChanges: [
    {
      target: "*/lib/<module>/<module>.signal.ts",
      action: "modify",
      applyScope: "auto",
      reason: "The slice key is renamed.",
    },
    {
      target: "*/lib/<module>/<module>.document.ts",
      action: "modify",
      applyScope: "auto",
      reason: "The Filter query key is renamed.",
    },
    {
      target: "*/lib/<module>/<module>.dictionary.ts",
      action: "modify",
      applyScope: "auto",
      reason: "The key's dictionary entry is renamed.",
    },
    {
      target: "{apps,libs}/**/*.{ts,tsx}",
      action: "modify",
      applyScope: "auto",
      reason: "Derived names (initMemoInPublic, listByName) follow the new key.",
    },
    { target: "*/lib/sig.ts", action: "sync", reason: "Generated signal barrel may change after sync." },
  ],
  validation: baseValidation,
  completionCriteria: [
    "The key and every derived name use the new key.",
    "Validation passes, so no use the rename left behind still names the old key.",
  ],
};
