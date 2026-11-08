import { AkanContextAnalyzer } from "@akanjs/devkit/akanContext";
import { runner, type Workspace } from "@akanjs/devkit/commandDecorators";
import {
  createRepairReport,
  generatedFilePathsForTarget,
  isWorkflowModuleName,
  isWorkflowSysName,
  type RepairAction,
  type RepairReport,
  renderRepairReport,
  type WorkflowDiagnostic,
  type WorkflowFormat,
  type WorkflowValidationCommandExecutor,
  writeGeneratedSyncState,
  writeWorkflowRunArtifact,
} from "@akanjs/devkit/workflow";
export type RepairKind = RepairAction["kind"];

const akanArgPattern = /^(?:--?[a-z][a-zA-Z0-9-]*|[A-Za-z0-9@_][A-Za-z0-9@._/:,=-]*)$/;

export const akanCommandArgs = (command: string): string[] | null => {
  if (/[^\x20-\x7e]/.test(command)) return null;
  const [head, ...args] = command.trim().split(/ +/);
  if (head !== "akan" || args.length === 0) return null;
  return args.every((arg) => akanArgPattern.test(arg) && !arg.includes("..")) ? args : null;
};

//? Commands come from plan files and MCP arguments, so they run as argv and never through a shell.
export const spawnAkan = async (workspace: Workspace, command: string) => {
  const args = akanCommandArgs(command);
  if (!args)
    throw Object.assign(
      new Error(`Not run: only an akan command with plain arguments runs here, not ${JSON.stringify(command)}.`),
      {
        code: 2,
      },
    );
  return await workspace.spawn("bun", ["run", "akan", ...args], { cwd: workspace.workspaceRoot });
};

export const isWorkspaceTarget = async (
  workspace: Workspace,
  target: string,
  { withPkgs = false }: { withPkgs?: boolean } = {},
) => {
  const [apps, libs] = await workspace.getSyss();
  if (isWorkflowSysName(target) && (apps.includes(target) || libs.includes(target))) return true;
  return withPkgs && (await workspace.getPkgs()).includes(target);
};

const defaultExecutor =
  (workspace: Workspace): WorkflowValidationCommandExecutor =>
  async (command) => {
    const base = { command: command.command, reason: command.reason };
    try {
      return { ...base, status: "passed", exitCode: 0, stdout: await spawnAkan(workspace, command.command) };
    } catch (error) {
      const commandError = error as { code?: number | null; stdout?: string; stderr?: string; message?: string };
      return {
        ...base,
        status: "failed",
        exitCode: commandError.code ?? 1,
        stdout: commandError.stdout,
        stderr: commandError.stderr ?? commandError.message,
      };
    }
  };

const targetMissing = (input: string): WorkflowDiagnostic => ({
  severity: "error",
  code: "repair-input-missing",
  input,
  message: `Repair command requires "${input}".`,
});

const repairInputNouns: Record<string, string> = {
  app: "an app or library of this workspace",
  target: "an app, library or package of this workspace",
  module: "a module name",
};

const targetUnknown = (input: string, value: string): WorkflowDiagnostic => ({
  severity: "error",
  code: "repair-input-unknown",
  input,
  message: `Repair input "${input}" is not ${repairInputNouns[input] ?? "a known name"}: ${JSON.stringify(value)}.`,
});

const repairAction = (kind: RepairKind, command: string, reason: string, safeToRun: boolean): RepairAction => ({
  kind,
  command,
  reason,
  safeToRun,
});

export interface RepairTarget {
  workspace: Workspace;
  app?: string | null;
  module?: string | null;
  target?: string | null;
}

export class RepairRunner extends runner("repair") {
  async repair(
    kind: RepairKind,
    {
      workspace,
      app = null,
      module = null,
      target = null,
      format = "markdown",
      execute,
    }: RepairTarget & { format?: WorkflowFormat; execute?: WorkflowValidationCommandExecutor },
  ) {
    const executor = execute ?? defaultExecutor(workspace);
    const report = await this.createRepairReport(kind, { workspace, app, module, target, execute: executor });
    const { artifact, runId } = await writeWorkflowRunArtifact(workspace, report);
    const reportWithArtifact = artifact as RepairReport;
    if (kind === "generated" && reportWithArtifact.status === "passed" && reportWithArtifact.target) {
      await writeGeneratedSyncState(workspace, {
        schemaVersion: 1,
        target: reportWithArtifact.target,
        status: "passed",
        syncedAt: reportWithArtifact.syncedAt ?? new Date().toISOString(),
        command: `akan sync ${reportWithArtifact.target}`,
        runId,
        generatedFiles: reportWithArtifact.generatedFiles ?? [],
      });
    }
    return renderRepairReport(reportWithArtifact, format);
  }

  async createRepairReport(
    kind: RepairKind,
    {
      workspace,
      app = null,
      module = null,
      target = null,
      execute,
    }: RepairTarget & { execute: WorkflowValidationCommandExecutor },
  ): Promise<RepairReport> {
    if (kind === "generated") {
      if (!app) {
        return createRepairReport({ command: "repair generated", kind, diagnostics: [targetMissing("app")] });
      }
      if (!(await isWorkspaceTarget(workspace, app)))
        return createRepairReport({ command: "repair generated", kind, diagnostics: [targetUnknown("app", app)] });
      const command = { command: `akan sync ${app}`, reason: "Refresh generated Akan files from source conventions." };
      const result = await execute(command);
      const [apps] = await workspace.getSyss();
      const targetRoot = `${apps.includes(app) ? "apps" : "libs"}/${app}`;
      return createRepairReport({
        command: "repair generated",
        kind,
        target: app,
        repairActions: [repairAction(kind, command.command, command.reason, true)],
        nextActions: [
          { command: `akan doctor --strict --format json`, reason: "Re-run doctor after generated files refresh." },
        ],
        commands: [result],
        generatedFiles: generatedFilePathsForTarget(targetRoot),
        ...(result.status === "passed" ? { syncedAt: new Date().toISOString() } : {}),
      });
    }

    if (kind === "format" || kind === "imports") {
      if (!target) {
        return createRepairReport({ command: `repair ${kind}`, kind, diagnostics: [targetMissing("target")] });
      }
      if (!(await isWorkspaceTarget(workspace, target, { withPkgs: true })))
        return createRepairReport({ command: `repair ${kind}`, kind, diagnostics: [targetUnknown("target", target)] });
      const command = { command: `akan lint ${target}`, reason: "Run Biome lint/fix path for formatting and imports." };
      return createRepairReport({
        command: `repair ${kind}`,
        kind,
        target,
        repairActions: [repairAction(kind, command.command, command.reason, true)],
        nextActions: [{ command: `akan doctor --strict --format json`, reason: "Re-run doctor after lint repair." }],
        commands: [await execute(command)],
      });
    }

    if (!app || !module) {
      return createRepairReport({
        command: `repair ${kind}`,
        kind,
        target: app,
        diagnostics: [!app ? targetMissing("app") : targetMissing("module")],
      });
    }
    if (!(await isWorkspaceTarget(workspace, app)) || !isWorkflowModuleName(module)) {
      const unknown = isWorkflowModuleName(module) ? targetUnknown("app", app) : targetUnknown("module", module);
      return createRepairReport({ command: `repair ${kind}`, kind, diagnostics: [unknown] });
    }

    const doctor = await AkanContextAnalyzer.doctor(workspace, { strict: true });
    const diagnostics = doctor.diagnostics.filter((diagnostic) => {
      if (kind === "dictionary")
        return diagnostic.code === "dictionary-label-missing" && diagnostic.path?.includes(module);
      return (
        (diagnostic.code === "module-shape-invalid" || diagnostic.code === "module-abstract-missing") &&
        diagnostic.path?.includes(module)
      );
    });
    const actionCommand =
      kind === "dictionary"
        ? `akan add-field --app ${app} --module ${module} --field <field> --type <type> --format json`
        : `akan create-module ${module} --app ${app} --format json`;
    return createRepairReport({
      command: `repair ${kind}`,
      kind,
      target: `${app}:${module}`,
      diagnostics:
        diagnostics.length > 0
          ? diagnostics
          : [
              {
                severity: "warning",
                code: `repair-${kind}-no-automatic-change`,
                message: `No safe automatic ${kind} repair was applied for ${app}:${module}.`,
              },
            ],
      repairActions: [
        repairAction(kind, actionCommand, "Use an explicit primitive command for source-safe repair.", false),
      ],
      nextActions: [
        { command: actionCommand, reason: "Run a source-aware primitive if this repair is needed." },
        { command: "akan doctor --strict --format json", reason: "Re-run doctor after manual or primitive repair." },
      ],
      commands: [],
    });
  }
}
