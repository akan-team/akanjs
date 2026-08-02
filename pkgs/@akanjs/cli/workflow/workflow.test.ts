import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CommandContainer } from "@akanjs/devkit/commandDecorators";
import {
  createWorkflowStepRegistry,
  type WorkflowApplyReport,
  type WorkflowPlan,
  type WorkflowValidationRunReport,
  workflowStepKey,
} from "@akanjs/devkit/workflow";
import { ModuleRunner } from "../module/module.runner";
import { ModuleScript } from "../module/module.script";
import { PrimitiveScript } from "../primitive/primitive.script";
import { ScalarScript } from "../scalar/scalar.script";
import { cleanupCliTempWorkspace, createTempModule, writeText } from "../testHelpers";
import { WorkflowRunner } from "./workflow.runner";

const tempRoots: string[] = [];

afterEach(async () => {
  CommandContainer.clear();
  await Promise.all(tempRoots.splice(0).map((root) => cleanupCliTempWorkspace(root)));
});

describe("WorkflowRunner", () => {
  test("lists initial workflow specs", () => {
    const output = new WorkflowRunner().list({ format: "json" });
    const result = JSON.parse(output) as {
      workflows: { name: string }[];
    };

    expect(result.workflows.map((workflow) => workflow.name)).toEqual([
      "add-enum-field",
      "add-field",
      "add-mutation",
      "add-slice",
      "create-module",
      "create-scalar",
      "create-ui",
    ]);
  });

  test("explains add-field with ordered steps and optional surfaces", () => {
    const output = new WorkflowRunner().explain("add-field");

    expect(output).toContain("# Workflow: add-field");
    expect(output).toContain("1. `inspect-module`");
    expect(output).toContain("2. `update-constant`");
    expect(output).toContain("- `template`: infer");
    expect(output).toContain("akan sync <app-or-lib>");
  });

  test("plans add-field as read-only json contract", async () => {
    const output = await new WorkflowRunner().plan(
      "add-field",
      {
        app: "demo",
        module: "task",
        field: "priority",
        type: "enum",
        values: "low,medium,high",
        default: null,
        scalar: null,
        surface: null,
        mutation: null,
        slice: null,
      },
      { format: "json" },
    );
    const plan = JSON.parse(output) as WorkflowPlan;

    expect(plan).toMatchObject({
      schemaVersion: 1,
      workflow: "add-field",
      mode: "plan",
      requiresApproval: true,
      diagnostics: [],
    });
    expect(plan.inputs).toMatchObject({ app: "demo", module: "task", field: "priority", type: "enum" });
    expect(plan.optionalSurfaces.template).toBe("infer");
    expect(plan.recommendations).toContainEqual(
      expect.objectContaining({ code: "workflow-apply-first", kind: "auto-apply" }),
    );
    expect(plan.recommendations).toContainEqual(
      expect.objectContaining({ code: "workflow-validate-apply-report", kind: "validation" }),
    );
    expect(plan.recommendations.map((recommendation) => recommendation.code)).toContain("add-field-component");
    expect(plan.recommendations).toContainEqual(
      expect.objectContaining({
        code: "add-field-component",
        message: expect.stringContaining("Field.ToggleSelect"),
      }),
    );
    expect(plan.recommendations).toContainEqual(
      expect.objectContaining({ code: "add-field-ui-manual-review", kind: "manual-action" }),
    );
    expect(plan.predictedChanges).toContainEqual(
      expect.objectContaining({ target: "apps/demo/lib/task/task.constant.ts", applyScope: "auto" }),
    );
    expect(plan.validation).toContainEqual(
      expect.objectContaining({ command: "akan sync <app-or-lib>", kind: "sync" }),
    );
    expect(output).not.toContain("akan scan");
  });

  test("plans number field types as unsupported before apply", async () => {
    const output = await new WorkflowRunner().plan(
      "add-field",
      {
        app: "demo",
        module: "task",
        field: "budget",
        type: "number",
        values: null,
        default: null,
        scalar: null,
        surface: null,
        mutation: null,
        slice: null,
      },
      { format: "json" },
    );
    const plan = JSON.parse(output) as WorkflowPlan;

    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({ code: "primitive-field-type-unsupported", input: "type" }),
    );
    expect(plan.recommendations).toContainEqual(
      expect.objectContaining({
        code: "add-field-type-choice",
        kind: "input-guidance",
        message: expect.stringContaining("Use Float for budget"),
      }),
    );
  });

  test("plans default literal normalization before apply", async () => {
    const output = await new WorkflowRunner().plan(
      "add-field",
      {
        app: "demo",
        module: "task",
        field: "budget",
        type: "Float",
        values: null,
        default: "0",
        scalar: null,
        surface: null,
        mutation: null,
        slice: null,
      },
      { format: "json" },
    );
    const plan = JSON.parse(output) as WorkflowPlan;

    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "workflow-default-value-normalized",
        message: expect.stringContaining("Float literal 0"),
      }),
    );
    expect(plan.recommendations).toContainEqual(
      expect.objectContaining({
        code: "add-field-default-normalized",
        message: expect.stringContaining("Float literal 0"),
        action: expect.stringContaining("omit the default input"),
      }),
    );
  });

  test("plans invalid enum default before apply", async () => {
    const output = await new WorkflowRunner().plan(
      "add-field",
      {
        app: "demo",
        module: "task",
        field: "priority",
        type: "enum",
        values: "low,high",
        default: "medium",
        scalar: null,
        surface: null,
        mutation: null,
        slice: null,
      },
      { format: "json" },
    );
    const plan = JSON.parse(output) as WorkflowPlan;

    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({ severity: "error", code: "workflow-default-value-invalid", input: "default" }),
    );
  });

  test("writes workflow plan artifact when out is provided", async () => {
    const { root } = await createTempModule("task");
    tempRoots.push(root);
    const out = path.join(root, ".akan/workflows/plans/task-priority.json");

    const output = await new WorkflowRunner().plan(
      "add-field",
      {
        app: "demo",
        module: "task",
        field: "priority",
        type: "enum",
        values: "low,medium,high",
        default: null,
        scalar: null,
        surface: null,
        mutation: null,
        slice: null,
      },
      { format: "json", out },
    );
    const saved = JSON.parse(await readFile(out, "utf8")) as WorkflowPlan;

    expect(saved.workflow).toBe("add-field");
    expect(saved.inputs.values).toEqual(["low", "medium", "high"]);
    expect(JSON.parse(output)).toMatchObject({ workflow: "add-field", mode: "plan" });
  });

  test("returns structured diagnostics for missing required input", async () => {
    const output = await new WorkflowRunner().plan("add-field", {
      app: "demo",
      module: null,
      field: null,
      type: null,
      values: null,
      default: null,
      scalar: null,
      surface: null,
      mutation: null,
      slice: null,
    });

    expect(output).toContain("[error] workflow-input-missing");
    expect(output).toContain('requires input "module"');
    expect(output).toContain('requires input "field"');
    expect(output).toContain('requires input "type"');
  });

  test("dry-runs workflow apply from a plan artifact without writing files", async () => {
    const { root, module } = await createTempModule("task");
    tempRoots.push(root);
    await new ModuleRunner().createModuleTemplate(module);
    const planPath = path.join(root, ".akan/workflows/plans/task-priority.json");
    const runner = new WorkflowRunner();
    await runner.plan(
      "add-field",
      {
        app: "demo",
        module: "task",
        field: "priority",
        type: "String",
        values: null,
        default: null,
        scalar: null,
        surface: null,
        mutation: null,
        slice: null,
      },
      { format: "json", out: planPath },
    );

    const output = await runner.apply(planPath, { dryRun: true, format: "json" });
    const report = JSON.parse(output) as WorkflowApplyReport;

    expect(report).toMatchObject({ workflow: "add-field", mode: "dry-run", status: "passed" });
    expect(report.changedFiles.map((file) => file.path)).toContain("apps/demo/lib/task/task.constant.ts");
    expect(report.summary.sourceFilesChanged.map((file) => file.path)).toContain("apps/demo/lib/task/task.constant.ts");
    expect(report.summary.generatedFilesSynced.map((file) => file.path)).toContain("apps/demo/lib/cnst.ts");
    expect(report.commands.map((command) => command.command)).toContain("akan sync demo");
    expect(report.recommendedValidationCommands.map((command) => command.command)).toContain("akan sync demo");
    expect(report.appliedCommands).toEqual([]);
    expect(await module.readFile("task.constant.ts")).not.toContain("priority");
  });

  test("renders apply reports with user-facing outcome sections", async () => {
    const { root, module } = await createTempModule("task");
    tempRoots.push(root);
    await new ModuleRunner().createModuleTemplate(module);
    const planPath = path.join(root, ".akan/workflows/plans/task-priority.json");
    const runner = new WorkflowRunner();
    await runner.plan(
      "add-field",
      {
        app: "demo",
        module: "task",
        field: "priority",
        type: "String",
        values: null,
        default: null,
        scalar: null,
        surface: null,
        mutation: null,
        slice: null,
      },
      { format: "json", out: planPath },
    );

    const output = await runner.apply(planPath, { dryRun: true });

    expect(output).toContain("## Automatically Modified");
    expect(output).toContain("## Generated Sync");
    expect(output).toContain("Source files changed:");
    expect(output).toContain("Generated files queued for sync:");
    expect(output).toContain("## User Review Required");
    expect(output).toContain("## Validation Blockers");
  });

  test("applies add-field workflow through primitive step runners", async () => {
    const { root, workspace, module } = await createTempModule("task");
    tempRoots.push(root);
    await new ModuleRunner().createModuleTemplate(module);
    const planPath = path.join(root, ".akan/workflows/plans/task-priority.json");
    const runner = new WorkflowRunner();
    await runner.plan(
      "add-field",
      {
        app: "demo",
        module: "task",
        field: "priority",
        type: "String",
        values: null,
        default: null,
        scalar: null,
        surface: null,
        mutation: null,
        slice: null,
      },
      { format: "json", out: planPath },
    );

    const output = await runner.apply(planPath, {
      format: "json",
      workspace,
      registry: createWorkflowStepRegistry({
        workspace,
        createModule: (sys, module) => CommandContainer.get(ModuleScript).createModuleTemplate(sys, module),
        createScalar: (sys, scalar) => CommandContainer.get(ScalarScript).createScalar(sys, scalar),
        createUi: (input) => CommandContainer.get(PrimitiveScript).createUi(workspace, input),
        addField: (input) => CommandContainer.get(PrimitiveScript).addField(workspace, input),
        addEnumField: (input) => CommandContainer.get(PrimitiveScript).addEnumField(workspace, input),
        addMutation: (input) => CommandContainer.get(PrimitiveScript).addMutation(workspace, input),
        addSlice: (input) => CommandContainer.get(PrimitiveScript).addSlice(workspace, input),
      }),
    });
    const report = JSON.parse(output) as WorkflowApplyReport;

    expect(report).toMatchObject({ workflow: "add-field", mode: "apply", status: "passed" });
    expect(report.changedFiles.map((file) => file.path)).toContain("apps/demo/lib/task/task.constant.ts");
    expect(report.commands.map((command) => command.command)).toContain("akan sync demo");
    expect(report.recommendedValidationCommands.map((command) => command.command)).toContain("akan typecheck demo");
    expect(report.postApplyChecks).toContainEqual(
      expect.objectContaining({ code: "workflow-post-apply-constant-shape-valid", status: "passed" }),
    );
    expect(report.postApplyChecks).toContainEqual(
      expect.objectContaining({ code: "workflow-post-apply-dictionary-shape-valid", status: "passed" }),
    );
    expect(report.postApplyChecks).toContainEqual(
      expect.objectContaining({ code: "workflow-post-apply-field-order-valid", status: "passed" }),
    );
    expect(report.nextActions.length).toBeLessThanOrEqual(3);
    expect(report.nextActions.map((action) => action.action)).toContain("manual-review");
    expect(report.nextActions.map((action) => action.action)).toContain("validate");
    expect(report.appliedCommands).toEqual([]);
    expect(report.recommendations.map((recommendation) => recommendation.code)).toContain(
      "add-field-ui-surface-review",
    );
    expect(report.recommendations).toContainEqual(
      expect.objectContaining({ code: "workflow-apply-first", kind: "auto-apply" }),
    );
    expect(report.recommendations).toContainEqual(
      expect.objectContaining({ code: "workflow-validate-apply-report", kind: "validation" }),
    );
    expect(report.recommendations).toContainEqual(
      expect.objectContaining({ code: "add-field-ui-surface-review", kind: "manual-action" }),
    );
    expect(report.recommendations).toContainEqual(
      expect.objectContaining({
        code: "add-field-ui-surface-review",
        action: expect.stringContaining("users will not see"),
      }),
    );
    expect(await module.readFile("task.constant.ts")).toContain("priority: field(String),");
    expect(await module.readFile("task.dictionary.ts")).toContain(
      'priority: t(["Priority", "우선순위"]).desc(["Enter priority.", "우선순위 값을 입력합니다."])',
    );
  });

  test("fails workflow apply when dictionary field is outside the model object", async () => {
    const { root, workspace, module } = await createTempModule("task");
    tempRoots.push(root);
    await new ModuleRunner().createModuleTemplate(module);
    const planPath = path.join(root, ".akan/workflows/plans/task-status.json");
    const runner = new WorkflowRunner();
    await runner.plan(
      "add-field",
      {
        app: "demo",
        module: "task",
        field: "status",
        type: "String",
        values: null,
        default: null,
        scalar: null,
        surface: null,
        mutation: null,
        slice: null,
      },
      { format: "json", out: planPath },
    );
    const registry = createWorkflowStepRegistry({
      workspace,
      createModule: (sys, module) => CommandContainer.get(ModuleScript).createModuleTemplate(sys, module),
      createScalar: (sys, scalar) => CommandContainer.get(ScalarScript).createScalar(sys, scalar),
      createUi: (input) => CommandContainer.get(PrimitiveScript).createUi(workspace, input),
      addField: (input) => CommandContainer.get(PrimitiveScript).addField(workspace, input),
      addEnumField: (input) => CommandContainer.get(PrimitiveScript).addEnumField(workspace, input),
      addMutation: (input) => CommandContainer.get(PrimitiveScript).addMutation(workspace, input),
      addSlice: (input) => CommandContainer.get(PrimitiveScript).addSlice(workspace, input),
    });
    registry[workflowStepKey("add-field", "update-ui-surfaces")] = async () => {
      await module.writeFile(
        "task.dictionary.ts",
        `import type { Task } from "./task.constant";
import { modelDictionary } from "akanjs/dictionary";

export const taskDictionary = modelDictionary("task")
  .model<Task>((t) => ({
    name: t(["Name", "이름"]),
  }))
  .slice("status", ["Status", "상태"])
  .translate({});
`,
      );
      return {
        changedFiles: [
          {
            path: "apps/demo/lib/task/task.dictionary.ts",
            action: "modify",
            reason: "Dictionary field was intentionally written outside .model().",
          },
        ],
      };
    };

    const output = await runner.apply(planPath, { format: "json", workspace, registry });
    const report = JSON.parse(output) as WorkflowApplyReport;

    expect(report.status).toBe("failed");
    expect(report.postApplyChecks).toContainEqual(
      expect.objectContaining({
        code: "workflow-post-apply-structure-invalid",
        target: "apps/demo/lib/task/task.dictionary.ts",
        status: "failed",
      }),
    );
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "workflow-post-apply-structure-invalid",
        failureScope: "source-change",
        message: expect.stringContaining(".model<Task>"),
      }),
    );
    expect(report.nextActions.map((action) => action.action)).toContain("blocked");
  });

  test("fails workflow apply when numeric base import is missing after apply", async () => {
    const { root, workspace, module } = await createTempModule("task");
    tempRoots.push(root);
    await new ModuleRunner().createModuleTemplate(module);
    const planPath = path.join(root, ".akan/workflows/plans/task-budget.json");
    const runner = new WorkflowRunner();
    await runner.plan(
      "add-field",
      {
        app: "demo",
        module: "task",
        field: "budget",
        type: "Int",
        values: null,
        default: null,
        scalar: null,
        surface: null,
        mutation: null,
        slice: null,
      },
      { format: "json", out: planPath },
    );
    const registry = createWorkflowStepRegistry({
      workspace,
      createModule: (sys, module) => CommandContainer.get(ModuleScript).createModuleTemplate(sys, module),
      createScalar: (sys, scalar) => CommandContainer.get(ScalarScript).createScalar(sys, scalar),
      createUi: (input) => CommandContainer.get(PrimitiveScript).createUi(workspace, input),
      addField: (input) => CommandContainer.get(PrimitiveScript).addField(workspace, input),
      addEnumField: (input) => CommandContainer.get(PrimitiveScript).addEnumField(workspace, input),
      addMutation: (input) => CommandContainer.get(PrimitiveScript).addMutation(workspace, input),
      addSlice: (input) => CommandContainer.get(PrimitiveScript).addSlice(workspace, input),
    });
    registry[workflowStepKey("add-field", "update-constant")] = async () => {
      await module.writeFile(
        "task.constant.ts",
        `import { field, via } from "akanjs/constant";

export class TaskInput extends via((field) => ({
  budget: field(Int),
})) {}
`,
      );
      await module.writeFile(
        "task.dictionary.ts",
        `import type { Task } from "./task.constant";
import { modelDictionary } from "akanjs/dictionary";

export const taskDictionary = modelDictionary("task").model<Task>((t) => ({
  budget: t(["Budget", "예산"]),
}));
`,
      );
      return {
        changedFiles: [
          {
            path: "apps/demo/lib/task/task.constant.ts",
            action: "modify",
            reason: "Constant field was intentionally written without a base import.",
          },
          {
            path: "apps/demo/lib/task/task.dictionary.ts",
            action: "modify",
            reason: "Dictionary field was written for structure validation.",
          },
        ],
      };
    };

    const output = await runner.apply(planPath, { format: "json", workspace, registry });
    const report = JSON.parse(output) as WorkflowApplyReport;

    expect(report.status).toBe("failed");
    expect(report.postApplyChecks).toContainEqual(
      expect.objectContaining({
        code: "workflow-post-apply-structure-invalid",
        target: "apps/demo/lib/task/task.constant.ts",
        status: "failed",
        message: expect.stringContaining('missing Int import from "akanjs/base"'),
      }),
    );
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code: "workflow-post-apply-structure-invalid", failureScope: "source-change" }),
    );
  });

  test("fails workflow apply when changedFiles path casing is inaccurate", async () => {
    const { root, workspace, module } = await createTempModule("task");
    tempRoots.push(root);
    await new ModuleRunner().createModuleTemplate(module);
    const planPath = path.join(root, ".akan/workflows/plans/task-priority.json");
    const runner = new WorkflowRunner();
    await runner.plan(
      "add-field",
      {
        app: "demo",
        module: "task",
        field: "priority",
        type: "String",
        values: null,
        default: null,
        scalar: null,
        surface: null,
        mutation: null,
        slice: null,
      },
      { format: "json", out: planPath },
    );

    const output = await runner.apply(planPath, {
      format: "json",
      workspace,
      registry: {
        inspectModule: async () => undefined,
        [workflowStepKey("add-field", "update-constant")]: async () => ({
          changedFiles: [
            {
              path: "apps/demo/lib/task/Task.constant.ts",
              action: "modify",
              reason: "Reported path intentionally uses wrong casing.",
            },
          ],
        }),
        [workflowStepKey("add-field", "update-dictionary")]: async () => undefined,
        [workflowStepKey("add-field", "update-ui-surfaces")]: async () => undefined,
        syncTarget: async () => undefined,
        lintTarget: async () => undefined,
      },
    });
    const report = JSON.parse(output) as WorkflowApplyReport;

    expect(report.status).toBe("failed");
    expect(report.postApplyChecks).toContainEqual(
      expect.objectContaining({ code: "workflow-path-casing-mismatch", status: "failed" }),
    );
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code: "workflow-path-casing-mismatch", failureScope: "source-change" }),
    );
  });

  test("applies Int default values as numeric literals through workflow apply", async () => {
    const { root, workspace, module } = await createTempModule("task");
    tempRoots.push(root);
    await new ModuleRunner().createModuleTemplate(module);
    const planPath = path.join(root, ".akan/workflows/plans/task-budget.json");
    const runner = new WorkflowRunner();
    await runner.plan(
      "add-field",
      {
        app: "demo",
        module: "task",
        field: "budget",
        type: "Int",
        values: null,
        default: "0",
        surfaces: "template",
        includeInLight: "true",
        scalar: null,
        surface: null,
        mutation: null,
        slice: null,
      },
      { format: "json", out: planPath },
    );

    const output = await runner.apply(planPath, {
      format: "json",
      workspace,
      registry: createWorkflowStepRegistry({
        workspace,
        createModule: (sys, module) => CommandContainer.get(ModuleScript).createModuleTemplate(sys, module),
        createScalar: (sys, scalar) => CommandContainer.get(ScalarScript).createScalar(sys, scalar),
        createUi: (input) => CommandContainer.get(PrimitiveScript).createUi(workspace, input),
        addField: (input) => CommandContainer.get(PrimitiveScript).addField(workspace, input),
        addEnumField: (input) => CommandContainer.get(PrimitiveScript).addEnumField(workspace, input),
        addMutation: (input) => CommandContainer.get(PrimitiveScript).addMutation(workspace, input),
        addSlice: (input) => CommandContainer.get(PrimitiveScript).addSlice(workspace, input),
      }),
    });
    const report = JSON.parse(output) as WorkflowApplyReport;

    expect(report.status).toBe("passed");
    expect(report.changedFiles.map((file) => file.path)).toContain("apps/demo/lib/task/Task.Template.tsx");
    expect(report.postApplyChecks?.map((check) => check.status)).toContain("passed");
    expect(await module.readFile("task.constant.ts")).toContain("budget: field(Int, { default: 0 }),");
    expect(await module.readFile("task.constant.ts")).toContain('"budget"');
    expect(await module.readFile("Task.Template.tsx")).toContain("<Field.Number");
  });

  test("persists apply reports as validation targets when workspace is provided", async () => {
    const { root, workspace, module } = await createTempModule("task");
    tempRoots.push(root);
    await new ModuleRunner().createModuleTemplate(module);
    const planPath = path.join(root, ".akan/workflows/plans/task-rating.json");
    const runner = new WorkflowRunner();
    await runner.plan(
      "add-field",
      {
        app: "demo",
        module: "task",
        field: "rating",
        type: "Float",
        values: null,
        default: null,
        scalar: null,
        surface: null,
        mutation: null,
        slice: null,
      },
      { format: "json", out: planPath },
    );

    const output = await runner.apply(planPath, {
      dryRun: true,
      format: "json",
      workspace,
    });
    const report = JSON.parse(output) as WorkflowApplyReport;

    expect(report.runId?.startsWith("dry-run-")).toBe(true);
    expect(report.validationTarget).toBe(report.applyReportPath);
    expect(report.applyReportPath).toBe(`.akan/workflows/runs/${report.runId}.json`);
    expect(await Bun.file(path.join(root, report.applyReportPath ?? "")).exists()).toBe(true);
    expect(report.recommendations.map((recommendation) => recommendation.code)).toContain("add-field-import");
    expect(report.recommendations).toContainEqual(
      expect.objectContaining({ code: "add-field-component", message: expect.stringContaining("Field.Number") }),
    );
  });

  test("fails add-field workflow apply for ambiguous number type", async () => {
    const { root, workspace, module } = await createTempModule("task");
    tempRoots.push(root);
    await new ModuleRunner().createModuleTemplate(module);
    const planPath = path.join(root, ".akan/workflows/plans/task-budget.json");
    const runner = new WorkflowRunner();
    await runner.plan(
      "add-field",
      {
        app: "demo",
        module: "task",
        field: "budget",
        type: "number",
        values: null,
        default: null,
        scalar: null,
        surface: null,
        mutation: null,
        slice: null,
      },
      { format: "json", out: planPath },
    );

    const output = await runner.apply(planPath, {
      format: "json",
      workspace,
      registry: createWorkflowStepRegistry({
        workspace,
        createModule: (sys, module) => CommandContainer.get(ModuleScript).createModuleTemplate(sys, module),
        createScalar: (sys, scalar) => CommandContainer.get(ScalarScript).createScalar(sys, scalar),
        createUi: (input) => CommandContainer.get(PrimitiveScript).createUi(workspace, input),
        addField: (input) => CommandContainer.get(PrimitiveScript).addField(workspace, input),
        addEnumField: (input) => CommandContainer.get(PrimitiveScript).addEnumField(workspace, input),
        addMutation: (input) => CommandContainer.get(PrimitiveScript).addMutation(workspace, input),
        addSlice: (input) => CommandContainer.get(PrimitiveScript).addSlice(workspace, input),
      }),
    });
    const report = JSON.parse(output) as WorkflowApplyReport;

    expect(report).toMatchObject({ workflow: "add-field", mode: "apply", status: "failed" });
    expect(report.recommendations).toContainEqual(
      expect.objectContaining({
        code: "add-field-type-choice",
        message: expect.stringContaining("Use Float for budget"),
      }),
    );
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code: "primitive-field-type-unsupported", input: "type" }),
    );
    expect(await module.readFile("task.constant.ts")).not.toContain("field(Number)");
    expect(await module.readFile("task.constant.ts")).not.toContain("budget:");
  });

  test("returns failed report for unsupported workflow steps", async () => {
    const { root, workspace } = await createTempModule("task");
    tempRoots.push(root);
    const planPath = path.join(root, ".akan/workflows/plans/archive-task.json");
    const runner = new WorkflowRunner();
    await runner.plan(
      "add-mutation",
      {
        app: "demo",
        module: "task",
        field: null,
        type: null,
        values: null,
        default: null,
        scalar: null,
        surface: null,
        mutation: "archive",
        slice: null,
      },
      { format: "json", out: planPath },
    );

    // An empty registry has no runner for any step, so the executor must report the first
    // step as unsupported rather than crashing.
    const output = await runner.apply(planPath, {
      format: "json",
      registry: {},
    });
    const report = JSON.parse(output) as WorkflowApplyReport;

    expect(report.status).toBe("failed");
    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain("workflow-step-unsupported");
    expect(report.nextActions.map((action) => action.command)).toContain("akan workflow explain add-mutation");
  });

  test("validates a workflow plan and stores a run report", async () => {
    const { root, workspace } = await createTempModule("task");
    tempRoots.push(root);
    const planPath = path.join(root, ".akan/workflows/plans/task-priority.json");
    const runner = new WorkflowRunner();
    await runner.plan(
      "add-field",
      {
        app: "demo",
        module: "task",
        field: "priority",
        type: "String",
        values: null,
        default: null,
        scalar: null,
        surface: null,
        mutation: null,
        slice: null,
      },
      { format: "json", out: planPath },
    );

    const output = await runner.validate(planPath, {
      format: "json",
      workspace,
      execute: async (command) => ({
        command: command.command,
        reason: command.reason,
        kind: command.kind,
        status: "passed",
        exitCode: 0,
        stdout: "ok",
      }),
    });
    const report = JSON.parse(output) as WorkflowValidationRunReport;
    const saved = JSON.parse(await readFile(path.join(root, ".akan/workflows/runs", `${report.runId}.json`), "utf8"));

    expect(report).toMatchObject({
      workflow: "add-field",
      mode: "validate",
      status: "passed",
      sourceStatus: "passed",
      workspaceStatus: "passed",
      summary: {
        sourceChange: "passed",
        generatedSync: "passed",
        workspaceConfig: "passed",
        environment: "passed",
      },
      overallStatus: "passed",
    });
    expect(report.commands).toContainEqual(expect.objectContaining({ command: "akan sync demo", kind: "sync" }));
    expect(report.knownBlockers).toEqual([]);
    expect(saved.runId).toBe(report.runId);
  });

  test("adds failure scope hints to validation command failures", async () => {
    const { root, workspace } = await createTempModule("task");
    tempRoots.push(root);
    const runner = new WorkflowRunner();
    const planPath = path.join(root, ".akan/workflows/plans/task-priority.json");
    await runner.plan(
      "add-field",
      {
        app: "demo",
        module: "task",
        field: "priority",
        type: "String",
        values: null,
        default: null,
        scalar: null,
        surface: null,
        mutation: null,
        slice: null,
      },
      { format: "json", out: planPath },
    );

    const output = await runner.validate(planPath, {
      format: "json",
      workspace,
      execute: async (command) => ({
        command: command.command,
        reason: command.reason,
        kind: command.kind,
        status: command.kind === "lint" ? "failed" : "passed",
        exitCode: command.kind === "lint" ? 1 : 0,
        failureScope: command.kind === "lint" ? "workspace-config" : undefined,
        stderr: command.kind === "lint" ? "Biome configuration file is invalid" : undefined,
      }),
    });
    const report = JSON.parse(output) as WorkflowValidationRunReport;

    expect(report).toMatchObject({
      status: "failed",
      sourceStatus: "passed",
      workspaceStatus: "failed",
      validationCommandsStatus: "failed",
      baselineStatus: "unknown",
      summary: {
        sourceChange: "passed",
        generatedSync: "passed",
        validationCommands: "failed",
        baseline: "unknown",
        workspaceConfig: "failed",
        environment: "passed",
      },
      overallStatus: "blocked-by-workspace-config",
    });
    expect(report.knownBlockers).toContainEqual(
      expect.objectContaining({ command: "akan lint demo", failureScope: "workspace-config" }),
    );
    expect(report.commands).toContainEqual(
      expect.objectContaining({ command: "akan lint demo", kind: "lint", failureScope: "workspace-config" }),
    );
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "workflow-validation-command-failed",
        command: "akan lint demo",
        kind: "lint",
        failureScope: "workspace-config",
      }),
    );

    const secondOutput = await runner.validate(planPath, {
      format: "json",
      workspace,
      execute: async (command) => ({
        command: command.command,
        reason: command.reason,
        kind: command.kind,
        status: command.kind === "lint" ? "failed" : "passed",
        exitCode: command.kind === "lint" ? 1 : 0,
        failureScope: command.kind === "lint" ? "workspace-config" : undefined,
        stderr: command.kind === "lint" ? "Biome configuration file is invalid" : undefined,
      }),
    });
    const secondReport = JSON.parse(secondOutput) as WorkflowValidationRunReport;

    expect(secondReport.knownBlockers).toContainEqual(
      expect.objectContaining({
        command: "akan lint demo",
        failureScope: "workspace-config",
        known: true,
        message: expect.stringContaining("Known baseline blocker"),
      }),
    );
  });

  test("separates passing source validation from baseline workspace blockers", async () => {
    const { root, workspace } = await createTempModule("task");
    tempRoots.push(root);
    await writeText(`${root}/apps/demo/base.ts`, "export const unrelated = true;\n");
    const runner = new WorkflowRunner();
    const planPath = path.join(root, ".akan/workflows/plans/task-priority.json");
    await runner.plan(
      "add-field",
      {
        app: "demo",
        module: "task",
        field: "priority",
        type: "String",
        values: null,
        default: null,
        scalar: null,
        surface: null,
        mutation: null,
        slice: null,
      },
      { format: "json", out: planPath },
    );

    const output = await runner.validate(planPath, {
      format: "json",
      workspace,
      execute: async (command) => ({
        command: command.command,
        reason: command.reason,
        kind: command.kind,
        status: "passed",
        exitCode: 0,
      }),
    });
    const report = JSON.parse(output) as WorkflowValidationRunReport;

    expect(report).toMatchObject({
      status: "failed",
      sourceStatus: "passed",
      validationCommandsStatus: "passed",
      baselineStatus: "failed",
      overallStatus: "passed-with-baseline-blockers",
      summary: {
        sourceChange: "passed",
        validationCommands: "passed",
        baseline: "failed",
      },
    });
    expect(report.baselineSummary).toMatchObject({
      status: "failed",
      totalErrors: expect.any(Number),
      detailsIncluded: false,
    });
    expect(report.baselineDiagnostics).toEqual([]);

    const detailedOutput = await runner.validate(planPath, {
      format: "json",
      workspace,
      includeBaselineDetails: true,
      execute: async (command) => ({
        command: command.command,
        reason: command.reason,
        kind: command.kind,
        status: "passed",
        exitCode: 0,
      }),
    });
    const detailedReport = JSON.parse(detailedOutput) as WorkflowValidationRunReport;

    expect(detailedReport.baselineSummary.detailsIncluded).toBe(true);
    expect(detailedReport.baselineDiagnostics).toContainEqual(
      expect.objectContaining({ code: "app-root-unknown-entry" }),
    );
  });

  test("reads stored workflow run reports", async () => {
    const { root, workspace } = await createTempModule("task");
    tempRoots.push(root);
    const runner = new WorkflowRunner();
    const planPath = path.join(root, ".akan/workflows/plans/task-priority.json");
    const validateOutput = await (async () => {
      await runner.plan(
        "add-field",
        {
          app: "demo",
          module: "task",
          field: "priority",
          type: "String",
          values: null,
          default: null,
          scalar: null,
          surface: null,
          mutation: null,
          slice: null,
        },
        { format: "json", out: planPath },
      );
      return await runner.validate(planPath, {
        format: "json",
        workspace,
        execute: async (command) => ({
          command: command.command,
          reason: command.reason,
          status: "passed",
          exitCode: 0,
        }),
      });
    })();
    const run = JSON.parse(validateOutput) as WorkflowValidationRunReport;

    const output = await runner.report(run.runId, { format: "json", workspace });

    expect(JSON.parse(output)).toMatchObject({ runId: run.runId, workflow: "add-field", mode: "validate" });
  });
});
