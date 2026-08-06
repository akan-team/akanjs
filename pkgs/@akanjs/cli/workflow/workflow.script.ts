import { script, type Workspace } from "@akanjs/devkit/commandDecorators";
import { createWorkflowStepRegistry, type WorkflowFormat, type WorkflowPlanInputs } from "@akanjs/devkit/workflow";
import { Logger } from "akanjs/common";
import { ModuleScript } from "../module/module.script";
import { PrimitiveScript } from "../primitive/primitive.script";
import { ScalarScript } from "../scalar/scalar.script";
import { WorkflowRunner } from "./workflow.runner";

export class WorkflowScript extends script("workflow", [WorkflowRunner, ModuleScript, ScalarScript, PrimitiveScript]) {
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
      Logger.rawLog(await this.workflowRunner.plan(workflow, inputs, { format, out }));
      return;
    }
    if (action === "apply") {
      if (!workspace) throw new Error("Workspace is required for workflow apply.");
      Logger.rawLog(
        await this.workflowRunner.apply(workflow, {
          dryRun,
          format,
          workspace,
          registry: createWorkflowStepRegistry({
            workspace,
            createModule: (sys, module) => this.moduleScript.createModuleTemplate(sys, module),
            createScalar: (sys, scalar) => this.scalarScript.createScalar(sys, scalar),
            createUi: (input) => this.primitiveScript.createUi(workspace, input),
            addField: (input) => this.primitiveScript.addField(workspace, input),
            addEnumField: (input) => this.primitiveScript.addEnumField(workspace, input),
            addMutation: (input) => this.primitiveScript.addMutation(workspace, input),
            addSlice: (input) => this.primitiveScript.addSlice(workspace, input),
          }),
        }),
      );
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
