import { command, Workspace } from "@akanjs/devkit/commandDecorators";
import { WorkflowScript } from "./workflow.script";

export class WorkflowCommand extends command("workflow", [WorkflowScript], ({ public: target }) => ({
  workflow: target({ desc: "List, explain, plan, apply, validate, or report Akan workflows" })
    .arg("action", String, {
      desc: "list, explain, plan, apply, validate, or report",
      enum: ["list", "explain", "plan", "apply", "validate", "report"],
    })
    .arg("workflow", String, { desc: "workflow name, plan path, or run id", nullable: true })
    .with(Workspace)
    .option("format", String, { desc: "output format", flag: "o", default: "markdown", enum: ["markdown", "json"] })
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
    .option("surfaces", String, {
      flag: "s",
      desc: "comma-separated UI surfaces add-field updates (template, unit, view)",
      nullable: true,
    })
    .option("includeInLight", Boolean, {
      flag: "p",
      desc: "add the field to the Light<Model> projection used by lists and cards",
      nullable: true,
    })
    .option("mutation", String, { flag: "n", desc: "mutation name", nullable: true })
    .option("slice", String, { flag: "i", desc: "slice name", nullable: true })
    .option("query", String, { desc: "Filter query key for rename-key", nullable: true })
    .option("to", String, { flag: "x", desc: "new key name for rename-key", nullable: true })
    .option("guard", String, { flag: "g", desc: "comma-separated guard class names", nullable: true })
    .option("with", String, {
      flag: "b",
      desc: "comma-separated <serviceRef>.<method> writes committed with the mutation",
      nullable: true,
    })
    .option("after", String, {
      flag: "e",
      desc: "comma-separated <serviceRef>.<method> side effects run after the commit",
      nullable: true,
    })
    .option("interaction", String, { flag: "k", desc: "interaction name", nullable: true })
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
        surfaces,
        includeInLight,
        mutation,
        slice,
        query,
        to,
        guard,
        withCalls,
        after,
        interaction,
      ) {
        await this.workflowScript.workflow(
          action,
          workflow,
          {
            app,
            module,
            field,
            type: typeName,
            values,
            default: defaultValue,
            scalar,
            surface,
            surfaces,
            includeInLight: includeInLight === null ? null : String(includeInLight),
            mutation,
            slice,
            query,
            to,
            guard,
            with: withCalls,
            after,
            interaction,
          },
          { format, out, dryRun, workspace },
        );
      },
    ),
})) {}
