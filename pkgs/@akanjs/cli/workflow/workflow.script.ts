import { script, type Workspace } from "@akanjs/devkit/commandDecorators";
import { renderWorkflowApply, type WorkflowFormat, type WorkflowPlanInputs } from "@akanjs/devkit/workflow";
import { Logger } from "akanjs/common";
import { WorkflowRunner } from "./workflow.runner";

export class WorkflowScript extends script("workflow", [WorkflowRunner]) {
  async workflow(
    action: string,
    workflow: string | null,
    inputs: WorkflowPlanInputs,
    {
      format = "markdown",
      out = null,
      dryRun = false,
      workspace,
    }: { format?: WorkflowFormat; out?: string | null; dryRun?: boolean; workspace?: Workspace } = {},
  ) {
    if (action === "list") {
      Logger.rawLog(this.workflowRunner.list({ format }));
      return;
    }
    if (!workflow) throw new Error(`Workflow name is required for "${action}".`);
    if (action === "explain") {
      Logger.rawLog(this.workflowRunner.explain(workflow, { format }));
      return;
    }
    if (action === "plan") {
      Logger.rawLog(await this.workflowRunner.plan(workflow, inputs, { format, out, workspace }));
      return;
    }
    if (action === "apply") {
      if (!workspace) throw new Error("Workspace is required for workflow apply.");
      const registry = WorkflowRunner.stepRegistry(workspace);
      const report = await this.workflowRunner.applyReport(workflow, { dryRun, workspace, registry });
      Logger.rawLog(renderWorkflowApply(report, format));
      if (report.status === "failed") process.exitCode = 1;
      return;
    }
    if (action === "validate") {
      if (!workspace) throw new Error("Workspace is required for workflow validate.");
      Logger.rawLog(await this.workflowRunner.validate(workflow, { format, workspace }));
      return;
    }
    if (action === "report") {
      if (!workspace) throw new Error("Workspace is required for workflow report.");
      Logger.rawLog(await this.workflowRunner.report(workflow, { format, workspace }));
      return;
    }
    throw new Error(`Unknown workflow action: ${action}. Use list, explain, plan, apply, validate, or report.`);
  }
}
