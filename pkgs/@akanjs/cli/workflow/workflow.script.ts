import { script, type Workspace } from "@akanjs/devkit/commandDecorators";
import {
  jsonText,
  renderWorkflowApply,
  renderWorkflowPlan,
  renderWorkflowValidation,
  type WorkflowFormat,
  type WorkflowPlanInputs,
  workflowStatus,
} from "@akanjs/devkit/workflow";
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
      const plan = await WorkflowScript.#reportOnly(format, () =>
        this.workflowRunner.planReport(workflow, inputs, { out, workspace }),
      );
      Logger.rawLog(format === "json" ? jsonText(plan) : renderWorkflowPlan(plan));
      if (workflowStatus(plan.diagnostics) === "failed") process.exitCode = 1;
      return;
    }
    if (action === "apply") {
      if (!workspace) throw new Error("Workspace is required for workflow apply.");
      const registry = WorkflowRunner.stepRegistry(workspace);
      const report = await WorkflowScript.#reportOnly(format, () =>
        this.workflowRunner.applyReport(workflow, { dryRun, workspace, registry }),
      );
      Logger.rawLog(renderWorkflowApply(report, format));
      if (report.status === "failed") process.exitCode = 1;
      return;
    }
    if (action === "validate") {
      if (!workspace) throw new Error("Workspace is required for workflow validate.");
      const report = await WorkflowScript.#reportOnly(format, () =>
        this.workflowRunner.validateReport(workflow, { workspace }),
      );
      Logger.rawLog(renderWorkflowValidation(report, format));
      if (report.status === "failed" && report.overallStatus !== "passed-with-baseline-blockers") process.exitCode = 1;
      return;
    }
    if (action === "report") {
      if (!workspace) throw new Error("Workspace is required for workflow report.");
      Logger.rawLog(
        await WorkflowScript.#reportOnly(format, () => this.workflowRunner.report(workflow, { format, workspace })),
      );
      return;
    }
    throw new Error(`Unknown workflow action: ${action}. Use list, explain, plan, apply, validate, or report.`);
  }

  static async #reportOnly<T>(format: WorkflowFormat, run: () => Promise<T>) {
    if (format !== "json") return await run();
    const consoleOutput = Logger.consoleOutput;
    Logger.consoleOutput = false;
    const removeSink = Logger.addSink((entry) => void process.stderr.write(entry.message), { minLevel: Logger.level });
    try {
      return await run();
    } finally {
      removeSink();
      Logger.consoleOutput = consoleOutput;
    }
  }
}
