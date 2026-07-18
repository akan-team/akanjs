import type { WorkflowDiagnostic, WorkflowValidationCommandResult } from "./types";

export const jsonText = (value: unknown, { trailingNewline = true }: { trailingNewline?: boolean } = {}) =>
  `${JSON.stringify(value, null, 2)}${trailingNewline ? "\n" : ""}`;

export const workflowStatus = (diagnostics: readonly WorkflowDiagnostic[]) =>
  diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "failed" : "passed";

export const commandStatus = (commands: readonly WorkflowValidationCommandResult[]) =>
  commands.some((command) => command.status === "failed") ? "failed" : "passed";

export const uniqueBy = <T>(values: readonly T[], key: (value: T) => string) => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const itemKey = key(value);
    if (seen.has(itemKey)) return false;
    seen.add(itemKey);
    return true;
  });
};

export const compactDiagnostics = (diagnostics: Array<WorkflowDiagnostic | false | null | undefined>) =>
  diagnostics.filter((diagnostic): diagnostic is WorkflowDiagnostic => !!diagnostic);
