import type { WorkflowInputSpec, WorkflowValidation } from "@akanjs/devkit/workflow";
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
  },
} satisfies Record<string, WorkflowInputSpec>;

export const baseValidation = [
  { command: "akan sync <app-or-lib>", reason: "Refresh generated Akan files from source conventions.", kind: "sync" },
  {
    command: "akan lint <app-or-lib-or-pkg>",
    reason: "Validate formatting, imports, and static lint rules.",
    kind: "lint",
  },
] satisfies readonly WorkflowValidation[];
