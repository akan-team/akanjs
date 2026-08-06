import { afterEach, describe, expect, test } from "bun:test";
import { AkanContextAnalyzer } from "@akanjs/devkit/akanContext";
import { CommandContainer } from "@akanjs/devkit/commandDecorators";
import type { RepairReport } from "@akanjs/devkit/workflow";
import { cleanupCliTempWorkspace, createTempModule, writeText } from "../testHelpers";
import { RepairRunner } from "./repair.runner";

const tempRoots: string[] = [];

afterEach(async () => {
  CommandContainer.clear();
  await Promise.all(tempRoots.splice(0).map((root) => cleanupCliTempWorkspace(root)));
});

describe("RepairRunner", () => {
  test("runs generated repair as a structured command report", async () => {
    const { root, workspace } = await createTempModule("task");
    tempRoots.push(root);

    const output = await new RepairRunner().repair("generated", {
      workspace,
      app: "demo",
      format: "json",
      execute: async (command) => ({
        command: command.command,
        reason: command.reason,
        status: "passed",
        exitCode: 0,
      }),
    });
    const report = JSON.parse(output) as RepairReport;

    expect(report).toMatchObject({ command: "repair generated", kind: "generated", status: "passed" });
    expect(report.runId?.startsWith("generated-")).toBe(true);
    expect(report.repairReportPath).toBe(`.akan/workflows/runs/${report.runId}.json`);
    expect(report.commands.map((command) => command.command)).toContain("akan sync demo");
    expect(report.generatedFiles?.map((file) => file.path)).toContain("apps/demo/lib/cnst.ts");
    expect(report.nextActions.map((action) => action.command)).toContain("akan doctor --strict --format json");
    expect(await Bun.file(`${root}/${report.repairReportPath}`).exists()).toBe(true);
    expect((await AkanContextAnalyzer.doctor(workspace)).generatedFilesFreshness.status).toBe("fresh");
  });

  test("runs format repair through lint path", async () => {
    const { root, workspace } = await createTempModule("task");
    tempRoots.push(root);

    const output = await new RepairRunner().repair("format", {
      workspace,
      target: "demo",
      format: "json",
      execute: async (command) => ({
        command: command.command,
        reason: command.reason,
        status: "passed",
        exitCode: 0,
      }),
    });
    const report = JSON.parse(output) as RepairReport;

    expect(report).toMatchObject({ command: "repair format", kind: "format", status: "passed" });
    expect(report.commands.map((command) => command.command)).toEqual(["akan lint demo"]);
  });

  test("reports dictionary repair candidates without broad rewrites", async () => {
    const { root, workspace, app } = await createTempModule("task");
    tempRoots.push(root);
    await writeText(
      `${app.cwdPath}/lib/task/task.constant.ts`,
      'import { field, via } from "akanjs/base";\nexport class TaskInput extends via.object({\n  title: field(String),\n})) {}\nexport class Task extends via.schema(TaskInput) {}\n',
    );
    await writeText(
      `${app.cwdPath}/lib/task/task.dictionary.ts`,
      'import { modelDictionary } from "akanjs/dictionary";\nimport type { Task } from "./task.constant";\nexport const dictionary = modelDictionary(["en", "ko"])\n  .model<Task>((t) => ({\n  }));\n',
    );

    const output = await new RepairRunner().repair("dictionary", {
      workspace,
      app: "demo",
      module: "task",
      format: "json",
      execute: async (command) => ({
        command: command.command,
        reason: command.reason,
        status: "passed",
        exitCode: 0,
      }),
    });
    const report = JSON.parse(output) as RepairReport;

    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain("dictionary-label-missing");
    expect(report.nextActions.map((action) => action.command).join("\n")).toContain("akan add-field");
    expect(report.commands).toEqual([]);
  });

  test("reports module shape repair next actions", async () => {
    const { root, workspace, app } = await createTempModule("task");
    tempRoots.push(root);
    await writeText(
      `${app.cwdPath}/lib/task/task.constant.ts`,
      'import { field, via } from "akanjs/base";\nexport class TaskInput extends via.object({\n  title: field(String),\n})) {}\nexport class Task extends via.schema(TaskInput) {}\n',
    );

    const output = await new RepairRunner().repair("module-shape", {
      workspace,
      app: "demo",
      module: "task",
      format: "json",
      execute: async (command) => ({
        command: command.command,
        reason: command.reason,
        status: "passed",
        exitCode: 0,
      }),
    });
    const report = JSON.parse(output) as RepairReport;

    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain("module-shape-invalid");
    expect(report.nextActions.map((action) => action.command).join("\n")).toContain("akan create-module");
  });
});
