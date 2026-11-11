import { afterEach, describe, expect, test } from "bun:test";
import { CommandContainer } from "@akanjs/devkit/commandDecorators";
import { AkanContextAnalyzer } from "@akanjs/devkit/context/akanContext";
import { createTempModule, tempRoots, writeText } from "@akanjs/devkit/test/testHelpers";
import { isWorkflowSysName, type RepairReport, type WorkflowValidationCommandExecutor } from "@akanjs/devkit/workflow";
import { akanCommandArgs, RepairRunner, spawnAkan } from "./repair.runner";

const passes: WorkflowValidationCommandExecutor = async (command) => ({
  command: command.command,
  reason: command.reason,
  status: "passed",
  exitCode: 0,
});

afterEach(() => CommandContainer.clear());
const track = tempRoots();

describe("RepairRunner", () => {
  test("runs generated repair as a structured command report", async () => {
    const { root, workspace } = track(await createTempModule("task"));

    const output = await new RepairRunner().repair("generated", {
      workspace,
      app: "demo",
      format: "json",
      execute: passes,
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
    const { workspace } = track(await createTempModule("task"));

    const output = await new RepairRunner().repair("format", {
      workspace,
      target: "demo",
      format: "json",
      execute: passes,
    });
    const report = JSON.parse(output) as RepairReport;

    expect(report).toMatchObject({ command: "repair format", kind: "format", status: "passed" });
    expect(report.commands.map((command) => command.command)).toEqual(["akan lint demo"]);
  });

  test("reports dictionary repair candidates without broad rewrites", async () => {
    const { workspace, app } = track(await createTempModule("task"));
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
      execute: passes,
    });
    const report = JSON.parse(output) as RepairReport;

    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain("dictionary-label-missing");
    expect(report.nextActions.map((action) => action.command).join("\n")).toContain("akan add-field");
    expect(report.commands).toEqual([]);
  });

  test("reports module shape repair next actions", async () => {
    const { workspace, app } = track(await createTempModule("task"));
    await writeText(
      `${app.cwdPath}/lib/task/task.constant.ts`,
      'import { field, via } from "akanjs/base";\nexport class TaskInput extends via.object({\n  title: field(String),\n})) {}\nexport class Task extends via.schema(TaskInput) {}\n',
    );

    const output = await new RepairRunner().repair("module-shape", {
      workspace,
      app: "demo",
      module: "task",
      format: "json",
      execute: passes,
    });
    const report = JSON.parse(output) as RepairReport;

    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain("module-shape-invalid");
    expect(report.nextActions.map((action) => action.command).join("\n")).toContain("akan create-module");
  });

  test("runs nothing for an app, target or module the workspace does not have", async () => {
    const { workspace } = track(await createTempModule("task"));
    const ran: string[] = [];
    const records: WorkflowValidationCommandExecutor = async (command) => {
      ran.push(command.command);
      return await passes(command);
    };
    const repair = async (kind: RepairReport["kind"], target: { app?: string; target?: string; module?: string }) =>
      JSON.parse(
        await new RepairRunner().repair(kind, { workspace, ...target, format: "json", execute: records }),
      ) as RepairReport;

    const reports = [
      await repair("generated", { app: "demo; touch marker #" }),
      await repair("generated", { app: "missing" }),
      await repair("imports", { target: "../demo" }),
      await repair("module-shape", { app: "demo", module: "task/../../x" }),
    ];

    expect(ran).toEqual([]);
    for (const report of reports) {
      expect(report.status).toBe("failed");
      expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["repair-input-unknown"]);
    }
  });

  test("splits an akan command into plain arguments and refuses anything else", async () => {
    const { workspace } = track(await createTempModule("task"));

    expect(akanCommandArgs("akan verify demo")).toEqual(["verify", "demo"]);
    expect(akanCommandArgs("akan doctor --strict --format json")).toEqual(["doctor", "--strict", "--format", "json"]);
    expect(akanCommandArgs("akan lint @akanjs/cli")).toEqual(["lint", "@akanjs/cli"]);
    for (const command of [
      "akan sync demo; id",
      "akan verify $(id)",
      "akan verify demo|cat",
      "akan verify ../demo",
      "akan verify demo\nakan code",
      "bun run build",
      "akan",
    ])
      expect(akanCommandArgs(command)).toBeNull();
    await expect(spawnAkan(workspace, "akan sync demo && id")).rejects.toThrow("Not run");
  });

  test("takes every app name create-application can produce, and no path", () => {
    for (const name of ["demo", "my-app", "my_app", "2048game", "myApp"]) expect(isWorkflowSysName(name)).toBe(true);
    for (const name of ["", "-x", "_x", "a/b", "a.b", "..", "a b"]) expect(isWorkflowSysName(name)).toBe(false);
  });
});
