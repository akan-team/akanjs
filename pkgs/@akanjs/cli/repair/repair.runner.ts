import { AkanContextAnalyzer } from "@akanjs/devkit/akanContext";
import { runner, type Workspace } from "@akanjs/devkit/commandDecorators";
import {
  createRepairReport,
  generatedFilePathsForTarget,
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

const commandForShell = (command: string) => (command.startsWith("akan ") ? `bun run ${command}` : command);

const defaultExecutor =
  (workspace: Workspace): WorkflowValidationCommandExecutor =>
  async (command) => {
    try {
      const stdout = await workspace.spawn("bash", ["-lc", commandForShell(command.command)], {
        cwd: workspace.workspaceRoot,
      });
      return {
        command: command.command,
        reason: command.reason,
        status: "passed",
        exitCode: 0,
        stdout,
      };
    } catch (error) {
      const commandError = error as { code?: number | null; stdout?: string; stderr?: string; message?: string };
      return {
        command: command.command,
        reason: command.reason,
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

const repairAction = (kind: RepairKind, command: string, reason: string, safeToRun: boolean): RepairAction => ({
  kind,
  command,
  reason,
  safeToRun,
});

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
    }: {
      workspace: Workspace;
      app?: string | null;
      module?: string | null;
      target?: string | null;
      format?: WorkflowFormat;
      execute?: WorkflowValidationCommandExecutor;
    },
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
    }: {
      workspace: Workspace;
      app?: string | null;
      module?: string | null;
      target?: string | null;
      execute: WorkflowValidationCommandExecutor;
    },
  ): Promise<RepairReport> {
    if (kind === "generated") {
      if (!app) {
        return createRepairReport({ command: "repair generated", kind, diagnostics: [targetMissing("app")] });
      }
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
