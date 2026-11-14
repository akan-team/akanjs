import type { WorkspaceExecutor } from "../../executors";
import type { RepairAction } from "../../workflow";
import type { AkanDiagnostic, AkanDoctorResult, AkanWorkspaceContext } from "../akanContext";
import { generatedFreshnessFromStates } from "./generatedFreshness";
import { isWorkflowRelatedDiagnostic } from "./workflowScope";

export const repairAction = (
  kind: RepairAction["kind"],
  command: string,
  reason: string,
  safeToRun: boolean,
): RepairAction => ({
  kind,
  command,
  reason,
  safeToRun,
});

export class DoctorFindings {
  readonly #diagnostics: AkanDiagnostic[] = [];
  readonly #repairActions: RepairAction[] = [
    repairAction("generated", "akan repair generated --app <app-or-lib>", "Refresh generated Akan files.", true),
    repairAction(
      "format",
      "akan repair format --target <app-or-lib-or-pkg>",
      "Run the formatter/linter repair path.",
      true,
    ),
  ];

  report(diagnostic: AkanDiagnostic, action: RepairAction) {
    this.#diagnostics.push({ ...diagnostic, repairActions: [action] });
    this.#repairActions.push(action);
  }

  push(diagnostic: AkanDiagnostic) {
    this.#diagnostics.push(diagnostic);
  }

  async result(
    workspace: WorkspaceExecutor,
    context: AkanWorkspaceContext,
    { strict, workflowPaths }: { strict: boolean; workflowPaths: string[] },
  ): Promise<AkanDoctorResult> {
    const scopedDiagnostics = this.#diagnostics.map((diagnostic) => ({
      ...diagnostic,
      scope: workflowPaths.length
        ? isWorkflowRelatedDiagnostic(diagnostic, workflowPaths)
          ? ("workflow" as const)
          : ("baseline" as const)
        : diagnostic.scope,
      context: workflowPaths.length ? { ...diagnostic.context, paths: workflowPaths } : diagnostic.context,
    }));
    const workflowDiagnostics = scopedDiagnostics.filter((diagnostic) => diagnostic.scope === "workflow");
    const baselineDiagnostics = scopedDiagnostics.filter((diagnostic) => diagnostic.scope === "baseline");
    return {
      schemaVersion: 1,
      repoName: context.repoName,
      root: context.root,
      strict,
      status: scopedDiagnostics.some((diagnostic) => diagnostic.severity === "error") ? "failed" : "passed",
      diagnostics: scopedDiagnostics,
      generatedFiles: context.generatedFiles,
      generatedFilesFreshness: await generatedFreshnessFromStates(workspace),
      validationCommands: context.validationCommands,
      repairActions: this.#repairActions,
      ...(workflowPaths.length ? { baselineDiagnostics, workflowDiagnostics } : {}),
    };
  }
}
