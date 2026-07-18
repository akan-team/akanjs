import { command, Workspace } from "@akanjs/devkit";
import { WorkflowScript } from "./workflow.script";

export class WorkflowCommand extends command("workflow", [WorkflowScript], ({ public: target }) => ({
  workflow: target({ desc: "List, explain, plan, apply, validate, or report Akan workflows" })
    .arg("action", String, {
      desc: "list, explain, plan, apply, validate, or report",
      enum: ["list", "explain", "plan", "apply", "validate", "report"],
    })
    .arg("workflow", String, { desc: "workflow name, plan path, or run id", nullable: true })
    .with(Workspace)
    .option("format", String, {
      desc: "output format",
      flag: "o",
      default: "markdown",
      enum: ["markdown", "json"],
    })
    .option("out", String, { flag: "w", desc: "write workflow plan JSON to this path", nullable: true })
    .option("dryRun", Boolean, { flag: "r", desc: "show predicted apply report without writing files", default: false })
    .option("app", String, { desc: "target app or library name", nullable: true })
    .option("module", String, { desc: "target module name", nullable: true })
    .option("field", String, { desc: "field name", nullable: true })
    .option("type", String, { desc: "field type or scalar name", nullable: true })
    .option("values", String, { flag: "l", desc: "comma-separated values", nullable: true })
    .option("default", String, { desc: "default value", nullable: true })
    .option("scalar", String, { flag: "c", desc: "scalar name", nullable: true })
    .option("surface", String, { flag: "u", desc: "UI surface name", nullable: true })
    .option("mutation", String, { flag: "n", desc: "mutation name", nullable: true })
    .option("slice", String, { flag: "i", desc: "slice name", nullable: true })
    .exec(
      async function (
        action,
        workflow,
        workspace,
        format,
        out,
        dryRun,
        app,
        module,
        field,
        typeName,
        values,
        defaultValue,
        scalar,
        surface,
        mutation,
        slice,
      ) {
        await this.workflowScript.workflow(
          action,
          workflow,
          { app, module, field, type: typeName, values, default: defaultValue, scalar, surface, mutation, slice },
          { format: format as "markdown" | "json", out, dryRun, workspace },
        );
      },
    ),
})) {}
