import type { WorkflowInputSpec, WorkflowStep, WorkflowValidation } from "@akanjs/devkit/workflow";
export const sysInputs = {
  app: {
    type: "string",
    required: true,
    description: "Target app or library name.",
  },
} satisfies Record<string, WorkflowInputSpec>;

export const moduleInput = {
  module: {
    type: "string",
    required: true,
    description: "Target domain, service, or scalar module name.",
    mustExist: true,
  },
} satisfies Record<string, WorkflowInputSpec>;

export const baseValidation = [
  {
    command: "akan verify <app-or-lib>",
    reason: "Sync, lint, typecheck and build the target in one run, printing only what failed.",
    kind: "verify",
  },
] satisfies readonly WorkflowValidation[];

const stepOf =
  (id: string, title: string, tool: string) =>
  (description: string): WorkflowStep => ({ id, title, tool, description });

export const inspectModuleStep = stepOf("inspect-module", "Inspect module", "inspectModule");
export const inspectSystemStep = stepOf("inspect-system", "Inspect target system", "inspectSystem");
export const syncGeneratedStep = stepOf("sync-generated", "Sync generated files", "syncTarget");
export const validateTargetStep = stepOf("validate-target", "Validate target", "lintTarget");
export const validateTarget = validateTargetStep("Run validation commands for the target.");
