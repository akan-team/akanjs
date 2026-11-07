import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CommandContainer } from "@akanjs/devkit/commandDecorators";
import { createTempModule, tempRoots, writeText } from "@akanjs/devkit/testHelpers";
import {
  type WorkflowApplyReport,
  type WorkflowPlan,
  type WorkflowPlanInputs,
  type WorkflowValidationCommandExecutor,
  type WorkflowValidationRunReport,
  workflowPathsForPlan,
  workflowStepKey,
} from "@akanjs/devkit/workflow";
import { ModuleRunner } from "../module/module.runner";
import { WorkflowRunner } from "./workflow.runner";

const planTaskWorkflow = async (
  inputs: WorkflowPlanInputs,
  { workflow = "add-field", plan = "task-priority", scaffold = true } = {},
) => {
  const { root, workspace, module } = track(await createTempModule("task"));
  if (scaffold) await new ModuleRunner().createModuleTemplate(module);
  const planPath = path.join(root, `.akan/workflows/plans/${plan}.json`);
  const runner = new WorkflowRunner();
  const output = await runner.plan(
    workflow,
    { app: "demo", module: "task", ...inputs },
    { format: "json", out: planPath, workspace },
  );
  return { root, workspace, module, planPath, runner, output };
};

afterEach(() => CommandContainer.clear());
const track = tempRoots();

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
      "create-interaction",
      "create-module",
      "create-scalar",
      "create-ui",
    ]);
  });

  test("lists and explains the lint rules a workflow is the fix for", () => {
    const runner = new WorkflowRunner();
    const listed = JSON.parse(runner.list({ format: "json" })) as {
      workflows: { name: string; replacesRules: string[] }[];
    };
    const rulesOf = (name: string) => listed.workflows.find((workflow) => workflow.name === name)?.replacesRules;

    expect(rulesOf("add-mutation")).toEqual([
      "akan.store.multi-write",
      "akan.component.write-chain",
      "akan.store.root-write-chain",
      "akan.write.placement",
    ]);
    expect(rulesOf("create-interaction")).toEqual(["akan.component.store-access", "akan.write.placement"]);
    expect(rulesOf("add-field")).toEqual([]);
    expect(runner.list()).toContain("  - Fixes: `akan.component.store-access`");
    const explained = runner.explain("add-mutation");
    expect(explained).toContain(
      "## Replaces Rules\nThis path is the fix when lint or the gate reports:\n- `akan.store.multi-write`",
    );
    expect(explained).toContain("- `guard` (required):");
    expect(JSON.parse(runner.explain("add-mutation", { format: "json" })).replacesRules).toHaveLength(4);
    expect(runner.explain("add-field")).not.toContain("## Replaces Rules");
  });

  test("explains add-field with ordered steps and optional surfaces", () => {
    const output = new WorkflowRunner().explain("add-field");

    expect(output).toContain("# Workflow: add-field");
    expect(output).toContain("1. `inspect-module`");
    expect(output).toContain("2. `update-constant`");
    expect(output).toContain("- `template`: infer");
    expect(output).toContain("akan verify <app-or-lib>");
  });

  test("plans add-field as read-only json contract", async () => {
    const output = await new WorkflowRunner().plan(
      "add-field",
      { app: "demo", module: "task", field: "priority", type: "enum", values: "low,medium,high" },
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
      expect.objectContaining({ command: "akan verify <app-or-lib>", kind: "verify" }),
    );
    expect(output).not.toContain("akan scan");
  });

  test("plans number field types as unsupported before apply", async () => {
    const output = await new WorkflowRunner().plan(
      "add-field",
      { app: "demo", module: "task", field: "budget", type: "number" },
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
      { app: "demo", module: "task", field: "budget", type: "Float", default: "0" },
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
      { app: "demo", module: "task", field: "priority", type: "enum", values: "low,high", default: "medium" },
      { format: "json" },
    );
    const plan = JSON.parse(output) as WorkflowPlan;

    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({ severity: "error", code: "workflow-default-value-invalid", input: "default" }),
    );
  });

  test("writes workflow plan artifact when out is provided", async () => {
    const { planPath, output } = await planTaskWorkflow(
      { field: "priority", type: "enum", values: "low,medium,high" },
      { scaffold: false },
    );
    const saved = JSON.parse(await readFile(planPath, "utf8")) as WorkflowPlan;

    expect(saved.workflow).toBe("add-field");
    expect(saved.inputs.values).toEqual(["low", "medium", "high"]);
    expect(JSON.parse(output)).toMatchObject({ workflow: "add-field", mode: "plan" });
  });

  test("returns structured diagnostics for missing required input", async () => {
    const output = await new WorkflowRunner().plan("add-field", { app: "demo" });

    expect(output).toContain("[error] workflow-input-missing");
    expect(output).toContain('requires input "module"');
    expect(output).toContain('requires input "field"');
    expect(output).toContain('requires input "type"');
  });

  test("dry-runs workflow apply from a plan artifact without writing files", async () => {
    const { module, planPath, runner } = await planTaskWorkflow({ field: "priority", type: "String" });

    const output = await runner.apply(planPath, { dryRun: true, format: "json" });
    const report = JSON.parse(output) as WorkflowApplyReport;

    expect(report).toMatchObject({ workflow: "add-field", mode: "dry-run", status: "passed" });
    expect(report.changedFiles.map((file) => file.path)).toContain("apps/demo/lib/task/task.constant.ts");
    expect(report.summary.sourceFilesChanged.map((file) => file.path)).toContain("apps/demo/lib/task/task.constant.ts");
    expect(report.summary.generatedFilesSynced.map((file) => file.path)).toContain("apps/demo/lib/cnst.ts");
    expect(report.commands.map((command) => command.command)).toContain("akan verify demo");
    expect(report.recommendedValidationCommands.map((command) => command.command)).toEqual(["akan verify demo"]);
    expect(report.appliedCommands).toEqual([]);
    expect(await module.readFile("task.constant.ts")).not.toContain("priority");
  });

  test("renders apply reports with user-facing outcome sections", async () => {
    const { planPath, runner } = await planTaskWorkflow({ field: "priority", type: "String" });

    const output = await runner.apply(planPath, { dryRun: true });

    expect(output).toContain("## Automatically Modified");
    expect(output).toContain("## Generated Sync");
    expect(output).toContain("Source files changed:");
    expect(output).toContain("Generated files queued for sync:");
    expect(output).toContain("## User Review Required");
    expect(output).toContain("## Validation Blockers");
  });

  test("applies add-field workflow through primitive step runners", async () => {
    const { workspace, module, planPath, runner } = await planTaskWorkflow({ field: "priority", type: "String" });

    const output = await runner.apply(planPath, {
      format: "json",
      workspace,
      registry: WorkflowRunner.stepRegistry(workspace),
    });
    const report = JSON.parse(output) as WorkflowApplyReport;

    expect(report).toMatchObject({ workflow: "add-field", mode: "apply", status: "passed" });
    expect(report.changedFiles.map((file) => file.path)).toContain("apps/demo/lib/task/task.constant.ts");
    expect(report.commands.map((command) => command.command)).toContain("akan verify demo");
    expect(report.recommendedValidationCommands.map((command) => command.command)).toEqual(["akan verify demo"]);
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
    const { workspace, module, planPath, runner } = await planTaskWorkflow(
      { field: "status", type: "String" },
      { plan: "task-status" },
    );
    const registry = WorkflowRunner.stepRegistry(workspace);
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
    const { workspace, module, planPath, runner } = await planTaskWorkflow(
      { field: "budget", type: "Int" },
      { plan: "task-budget" },
    );
    const registry = WorkflowRunner.stepRegistry(workspace);
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
    const { workspace, planPath, runner } = await planTaskWorkflow({ field: "priority", type: "String" });

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
    const { workspace, module, planPath, runner } = await planTaskWorkflow(
      { field: "budget", type: "Int", default: "0", surfaces: "template", includeInLight: "true" },
      { plan: "task-budget" },
    );

    const output = await runner.apply(planPath, {
      format: "json",
      workspace,
      registry: WorkflowRunner.stepRegistry(workspace),
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
    const { root, workspace, planPath, runner } = await planTaskWorkflow(
      { field: "rating", type: "Float" },
      { plan: "task-rating" },
    );

    const output = await runner.apply(planPath, { dryRun: true, format: "json", workspace });
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
    const { workspace, module, planPath, runner } = await planTaskWorkflow(
      { field: "budget", type: "number" },
      { plan: "task-budget" },
    );

    const output = await runner.apply(planPath, {
      format: "json",
      workspace,
      registry: WorkflowRunner.stepRegistry(workspace),
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
    const { planPath, runner } = await planTaskWorkflow(
      { mutation: "archiveTask", guard: "Public" },
      { workflow: "add-mutation", plan: "archive-task", scaffold: false },
    );

    const output = await runner.apply(planPath, { format: "json", registry: {} });
    const report = JSON.parse(output) as WorkflowApplyReport;

    expect(report.status).toBe("failed");
    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain("workflow-step-unsupported");
    expect(report.nextActions.map((action) => action.command)).toContain("akan workflow explain add-mutation");
  });

  test("runs every add-mutation and add-slice step, leaving the UI surfaces as a review", async () => {
    const { root, workspace, module } = track(await createTempModule("task"));
    await new ModuleRunner().createModuleTemplate(module);
    const runner = new WorkflowRunner();
    const registry = WorkflowRunner.stepRegistry(workspace);
    const inputs = {
      app: "demo",
      module: "task",
      field: null,
      type: null,
      values: null,
      default: null,
      scalar: null,
      surface: null,
      mutation: null,
      slice: null,
    };
    const applyWorkflow = async (workflow: string, extra: Record<string, string>) => {
      const planPath = path.join(root, `.akan/workflows/plans/${workflow}.json`);
      await runner.plan(workflow, { ...inputs, ...extra }, { format: "json", out: planPath, workspace });
      return JSON.parse(await runner.apply(planPath, { format: "json", workspace, registry })) as WorkflowApplyReport;
    };

    const mutationReport = await applyWorkflow("add-mutation", { mutation: "archiveTask", guard: "Public" });
    const sliceReport = await applyWorkflow("add-slice", { slice: "inOwner" });

    for (const report of [mutationReport, sliceReport]) {
      expect(report.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("workflow-step-unsupported");
      expect(report.status).toBe("passed");
    }
    expect(mutationReport.recommendations).toContainEqual(
      expect.objectContaining({ code: "add-mutation-action-surface-review", kind: "manual-action" }),
    );
    expect(sliceReport.recommendations).toContainEqual(
      expect.objectContaining({
        code: "add-slice-view-surface-review",
        action: expect.stringContaining("fetch.initTaskInOwner()"),
      }),
    );
    const signalSource = await module.readFile("task.signal.ts");
    expect(signalSource).toContain("archiveTask: mutation(cnst.Task, { guards: [Public], rateLimit: { calls: 20 } })");
    expect(signalSource).toContain("inOwner: init({ guards: [None] })");
    expect(signalSource).toMatch(/import \{[^}]*\bNone\b[^}]*\} from "akanjs\/signal";/);
  });

  test("validates a workflow plan and stores a run report", async () => {
    const { root, workspace, planPath, runner } = await planTaskWorkflow(
      { field: "priority", type: "String" },
      { scaffold: false },
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
    expect(report.commands).toContainEqual(expect.objectContaining({ command: "akan verify demo", kind: "verify" }));
    expect(report.knownBlockers).toEqual([]);
    expect(saved.runId).toBe(report.runId);
  });

  test("reads a failed sync out of the akan verify header", async () => {
    const { workspace, planPath, runner } = await planTaskWorkflow(
      { field: "priority", type: "String" },
      { scaffold: false },
    );
    const validateWith = async (stdout: string) =>
      JSON.parse(
        await runner.validate(planPath, {
          format: "json",
          workspace,
          execute: async (command) => ({
            command: command.command,
            reason: command.reason,
            kind: command.kind,
            status: "failed",
            exitCode: 1,
            stdout,
          }),
        }),
      ) as WorkflowValidationRunReport;

    const syncFailed = await validateWith("verify fail · demo · sync 1 error · typecheck skipped · 0.4s\nx");
    const lintFailed = await validateWith("verify fail · demo · lint 2 errors · typecheck ok · 3.1s\nx");

    expect(syncFailed.summary.generatedSync).toBe("failed");
    expect(lintFailed.summary.generatedSync).toBe("passed");
  });

  test("adds failure scope hints to validation command failures", async () => {
    const { workspace, planPath, runner } = await planTaskWorkflow(
      { field: "priority", type: "String" },
      { scaffold: false },
    );
    const lintFails: WorkflowValidationCommandExecutor = async (command) => ({
      command: command.command,
      reason: command.reason,
      kind: command.kind,
      status: command.kind === "verify" ? "failed" : "passed",
      exitCode: command.kind === "verify" ? 1 : 0,
      failureScope: command.kind === "verify" ? "workspace-config" : undefined,
      stderr: command.kind === "verify" ? "Biome configuration file is invalid" : undefined,
    });

    const output = await runner.validate(planPath, { format: "json", workspace, execute: lintFails });
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
      expect.objectContaining({ command: "akan verify demo", failureScope: "workspace-config" }),
    );
    expect(report.commands).toContainEqual(
      expect.objectContaining({ command: "akan verify demo", kind: "verify", failureScope: "workspace-config" }),
    );
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "workflow-validation-command-failed",
        command: "akan verify demo",
        kind: "verify",
        failureScope: "workspace-config",
      }),
    );

    const secondOutput = await runner.validate(planPath, { format: "json", workspace, execute: lintFails });
    const secondReport = JSON.parse(secondOutput) as WorkflowValidationRunReport;

    expect(secondReport.knownBlockers).toContainEqual(
      expect.objectContaining({
        command: "akan verify demo",
        failureScope: "workspace-config",
        known: true,
        message: expect.stringContaining("Known baseline blocker"),
      }),
    );
  });

  test("separates passing source validation from baseline workspace blockers", async () => {
    const { root, workspace, planPath, runner } = await planTaskWorkflow(
      { field: "priority", type: "String" },
      { scaffold: false },
    );
    await writeText(`${root}/apps/demo/base.ts`, "export const unrelated = true;\n");
    const passes: WorkflowValidationCommandExecutor = async (command) => ({
      command: command.command,
      reason: command.reason,
      kind: command.kind,
      status: "passed",
      exitCode: 0,
    });

    const output = await runner.validate(planPath, { format: "json", workspace, execute: passes });
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
      execute: passes,
    });
    const detailedReport = JSON.parse(detailedOutput) as WorkflowValidationRunReport;

    expect(detailedReport.baselineSummary.detailsIncluded).toBe(true);
    expect(detailedReport.baselineDiagnostics).toContainEqual(
      expect.objectContaining({ code: "app-root-unknown-entry" }),
    );
  });

  test("reads stored workflow run reports", async () => {
    const { workspace, planPath, runner } = await planTaskWorkflow(
      { field: "priority", type: "String" },
      { scaffold: false },
    );
    const validateOutput = await runner.validate(planPath, {
      format: "json",
      workspace,
      execute: async (command) => ({ command: command.command, reason: command.reason, status: "passed", exitCode: 0 }),
    });
    const run = JSON.parse(validateOutput) as WorkflowValidationRunReport;

    const output = await runner.report(run.runId, { format: "json", workspace });

    expect(JSON.parse(output)).toMatchObject({ runId: run.runId, workflow: "add-field", mode: "validate" });
  });

  describe("add-mutation", () => {
    const planMutation = async (inputs: WorkflowPlanInputs, { scaffold = true } = {}) => {
      const planned = await planTaskWorkflow(
        { mutation: "archiveTask", ...inputs },
        { workflow: "add-mutation", plan: "archive-task", scaffold },
      );
      return { ...planned, plan: JSON.parse(planned.output) as WorkflowPlan };
    };

    test("refuses to plan without a guard and lists the guards the target reaches", async () => {
      const { plan } = await planMutation({});

      expect(plan.diagnostics).toContainEqual(
        expect.objectContaining({ severity: "error", code: "workflow-input-missing", input: "guard" }),
      );
      expect(plan.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("add-mutation-guard-missing");
      expect(plan.recommendations).toContainEqual(
        expect.objectContaining({ code: "add-mutation-guard-choices", message: expect.stringContaining("Public") }),
      );
    });

    test("refuses an unknown guard and None at plan time", async () => {
      const { plan } = await planMutation({ guard: "Nobody,None" });

      expect(plan.diagnostics).toContainEqual(
        expect.objectContaining({ severity: "error", code: "add-mutation-guard-unknown", input: "guard" }),
      );
      expect(plan.diagnostics).toContainEqual(expect.objectContaining({ code: "add-mutation-guard-none" }));
    });

    test("refuses a CRUD name, and a name the module already declares", async () => {
      const reserved = await planMutation({ mutation: "updateTask", guard: "Public" });
      expect(reserved.plan.diagnostics).toContainEqual(
        expect.objectContaining({ severity: "error", code: "add-mutation-name-reserved", input: "mutation" }),
      );

      const { root, workspace, planPath, runner } = await planMutation({ guard: "Public" });
      const applied = JSON.parse(
        await runner.apply(planPath, { format: "json", workspace, registry: WorkflowRunner.stepRegistry(workspace) }),
      ) as WorkflowApplyReport;
      expect(applied.status).toBe("passed");
      const replanned = JSON.parse(
        await runner.plan(
          "add-mutation",
          { app: "demo", module: "task", mutation: "archiveTask", guard: "Public" },
          { format: "json", workspace, out: path.join(root, ".akan/workflows/plans/again.json") },
        ),
      ) as WorkflowPlan;
      expect(replanned.diagnostics).toContainEqual(
        expect.objectContaining({ severity: "error", code: "add-mutation-name-exists" }),
      );
    });

    test("plans a module that does not exist yet with a warning, so a create-module plan can precede it", async () => {
      const { plan } = await planMutation({ guard: "Public" }, { scaffold: false });

      expect(plan.diagnostics).toEqual([
        expect.objectContaining({ severity: "warning", code: "add-mutation-module-missing" }),
      ]);
    });

    test("applies with and after into one transaction behind the guarded endpoint", async () => {
      const { root, workspace, module } = track(await createTempModule("task"));
      await new ModuleRunner().createModuleTemplate(module);
      await writeText(
        path.join(root, "apps/demo/srvkit/guards.ts"),
        'import type { Guard } from "akanjs/signal";\n\nexport class Staff implements Guard {\n  canPass() {\n    return true;\n  }\n}\n',
      );
      await writeText(
        path.join(root, "apps/demo/lib/_noti/noti.service.ts"),
        'import { serve } from "akanjs/service";\n\nexport class NotiService extends serve("noti", () => ({})) {\n  async sendArchived(taskId: string) {\n    return taskId;\n  }\n}\n',
      );
      const runner = new WorkflowRunner();
      const planPath = path.join(root, ".akan/workflows/plans/archive.json");
      await runner.plan(
        "add-mutation",
        {
          app: "demo",
          module: "task",
          mutation: "archiveTask",
          guard: "Staff",
          with: "task.getTask",
          after: "noti.sendArchived",
        },
        { format: "json", out: planPath, workspace },
      );

      const report = JSON.parse(
        await runner.apply(planPath, { format: "json", workspace, registry: WorkflowRunner.stepRegistry(workspace) }),
      ) as WorkflowApplyReport;

      expect(report.status).toBe("passed");
      expect(report.changedFiles.map((file) => file.path)).toContain("apps/demo/lib/task/task.signal.test.ts");
      expect(report.postApplyChecks?.every((check) => check.status === "passed")).toBe(true);
      const service = await module.readFile("task.service.ts");
      expect(service).toContain("notiService: service<srv.NotiService>(),");
      expect(service).toContain("      await this.getTask(task.id);\n");
      expect(service).toContain("      await this.afterCommit(() => this.notiService.sendArchived(task.id));\n");
      expect(await module.readFile("task.signal.ts")).toContain(
        "archiveTask: mutation(cnst.Task, { guards: [Staff] })",
      );
    });
  });

  describe("create-interaction", () => {
    test("plans and applies the hook, the pure class and its test", async () => {
      const { root, workspace, app } = track(await createTempModule("task"));
      const runner = new WorkflowRunner();
      const planPath = path.join(root, ".akan/workflows/plans/board-keys.json");
      const plan = JSON.parse(
        await runner.plan(
          "create-interaction",
          { app: "demo", interaction: "boardKeys" },
          { format: "json", out: planPath, workspace },
        ),
      ) as WorkflowPlan;
      expect(plan.diagnostics).toEqual([]);

      const report = JSON.parse(
        await runner.apply(planPath, { format: "json", workspace, registry: WorkflowRunner.stepRegistry(workspace) }),
      ) as WorkflowApplyReport;

      expect(report.status).toBe("passed");
      expect(report.changedFiles.map((file) => file.path)).toEqual([
        "apps/demo/common/boardKeys.ts",
        "apps/demo/common/boardKeys.test.ts",
        "apps/demo/webkit/useBoardKeys.tsx",
      ]);
      expect(await app.readFile("webkit/useBoardKeys.tsx")).toContain("export const useBoardKeys = ");
      const replanned = JSON.parse(
        await runner.plan(
          "create-interaction",
          { app: "demo", interaction: "boardKeys" },
          { format: "json", workspace },
        ),
      ) as WorkflowPlan;
      expect(replanned.diagnostics).toContainEqual(
        expect.objectContaining({ severity: "error", code: "create-interaction-exists" }),
      );
    });

    test("predicts the files a use-prefixed name writes", async () => {
      const { workspace } = track(await createTempModule("task"));
      const plan = JSON.parse(
        await new WorkflowRunner().plan(
          "create-interaction",
          { app: "demo", interaction: "useBoardKeys" },
          { format: "json", workspace },
        ),
      ) as WorkflowPlan;

      expect(workflowPathsForPlan(plan)).toEqual(
        expect.arrayContaining(["apps/demo/common/boardKeys.ts", "apps/demo/webkit/useBoardKeys.tsx"]),
      );
    });
  });
});

describe("akan workflow", () => {
  test("passes --surfaces and --include-in-light to the add-field plan inputs", async () => {
    const { root } = track(await createTempModule("task"));
    const entry = path.join(root, "cli.ts");
    await writeText(
      entry,
      [
        `import { runCommands } from ${JSON.stringify(Bun.resolveSync("@akanjs/devkit/commandDecorators", import.meta.dir))};`,
        `import { WorkflowCommand } from ${JSON.stringify(path.join(import.meta.dir, "workflow.command.ts"))};`,
        "await runCommands(WorkflowCommand);",
        "",
      ].join("\n"),
    );
    const planPath = path.join(root, "plan.json");
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("AKAN_")));
    const args = ["--app", "demo", "--module", "task", "--field", "budget", "--type", "Int", "--out", planPath];
    const proc = Bun.spawn(
      ["bun", entry, "workflow", "plan", "add-field", ...args, "--surfaces", "template,unit", "--include-in-light"],
      {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...env, HOME: path.join(root, "home"), GIT_CEILING_DIRECTORIES: path.dirname(root) },
      },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
    expect(stdout).not.toContain("unknown option");
    const plan = JSON.parse(await readFile(planPath, "utf8")) as WorkflowPlan;
    expect(plan.inputs).toMatchObject({ surfaces: ["template", "unit"], includeInLight: true });
  }, 60_000);
});
