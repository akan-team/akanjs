import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AkanContextAnalyzer } from "@akanjs/devkit/akanContext";
import { CommandContainer, runner, type Workspace } from "@akanjs/devkit/commandDecorators";
import { WorkspaceExecutor } from "@akanjs/devkit/executors";
import {
  compactWorkflowInputs,
  createDryRunWorkflowApplyReport,
  createWorkflowApplyReport,
  createWorkflowBaselineSummary,
  createWorkflowPlan,
  createWorkflowStepRegistry,
  createWorkflowValidationRunReport,
  getWorkflowSpec,
  inspectWorkflowPlan,
  jsonText,
  listWorkflowSpecs,
  readWorkflowRunArtifact,
  renderWorkflowApply,
  renderWorkflowExplain,
  renderWorkflowList,
  renderWorkflowPlan,
  renderWorkflowRunArtifact,
  renderWorkflowValidation,
  type WorkflowApplyCommand,
  type WorkflowApplyReport,
  type WorkflowDiagnostic,
  WorkflowExecutor,
  type WorkflowFailureScope,
  type WorkflowFormat,
  type WorkflowKnownBlocker,
  type WorkflowPlan,
  type WorkflowPlanInputs,
  type WorkflowRunArtifact,
  type WorkflowStepRegistry,
  type WorkflowValidationCommandExecutor,
  type WorkflowValidationKind,
  type WorkflowValidationRunReport,
  workflowCommandsForPlan,
  workflowPathsForPlan,
  workflowPlanApproval,
  writeWorkflowRunArtifact,
} from "@akanjs/devkit/workflow";
import { isRecord } from "akanjs/common";
import { ModuleScript } from "../module/module.script";
import { PrimitiveScript } from "../primitive/primitive.script";
import { spawnShell } from "../repair/repair.runner";
import { ScalarScript } from "../scalar/scalar.script";
import { workflowSpecs } from "../workflows";

const resolvePath = (filePath: string) => (path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath));

const isWorkflowPlan = (value: unknown): value is WorkflowPlan => {
  if (!isRecord(value)) return false;
  return value.schemaVersion === 1 && value.mode === "plan" && typeof value.workflow === "string";
};

const isWorkflowApplyReport = (value: unknown): value is WorkflowApplyReport => {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === 1 && (value.mode === "apply" || value.mode === "dry-run") && isWorkflowPlan(value.plan)
  );
};

const isWorkflowRunArtifact = (value: unknown): value is WorkflowRunArtifact => {
  if (!isRecord(value)) return false;
  return value.schemaVersion === 1 && (typeof value.mode === "string" || typeof value.command === "string");
};

const failedPlan = (workflow: string, diagnostics: WorkflowApplyReport["diagnostics"]): WorkflowPlan => ({
  schemaVersion: 1,
  workflow,
  mode: "plan",
  inputs: {},
  optionalSurfaces: {},
  steps: [],
  predictedChanges: [],
  validation: [],
  diagnostics,
  recommendations: [],
  requiresApproval: true,
  approval: workflowPlanApproval,
});

const failedApplyReport = (workflow: string, code: string, message: string, plan?: WorkflowPlan) => {
  const diagnostics: WorkflowDiagnostic[] = [{ severity: "error", code, message }];
  return createWorkflowApplyReport({
    workflow,
    mode: "apply",
    changedFiles: [],
    generatedFiles: [],
    commands: [],
    diagnostics,
    nextActions: [],
    plan: plan ?? failedPlan(workflow, diagnostics),
  });
};

const inferValidationKind = (command: WorkflowApplyCommand): WorkflowValidationKind => {
  if (command.kind) return command.kind;
  if (/\bakan\s+sync\b/.test(command.command)) return "sync";
  if (/\bakan\s+lint\b/.test(command.command)) return "lint";
  if (/\bakan\s+typecheck\b/.test(command.command)) return "typecheck";
  if (/\bakan\s+doctor\b/.test(command.command)) return "doctor";
  return "custom";
};

const classifyValidationFailure = (
  command: WorkflowApplyCommand,
  error: { code?: number | null; stdout?: string; stderr?: string; message?: string },
): WorkflowFailureScope => {
  const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}\n${error.message ?? ""}`.toLowerCase();
  if (error.code === 127 || output.includes("command not found") || output.includes("bun: command not found")) {
    return "environment";
  }
  if (
    output.includes("biome.json") ||
    output.includes("biome configuration") ||
    output.includes("configuration file") ||
    output.includes("invalid configuration") ||
    output.includes("failed to load")
  ) {
    return "workspace-config";
  }
  const kind = inferValidationKind(command);
  if (kind === "lint" || kind === "typecheck" || kind === "sync") return "source-change";
  return "unknown";
};

const defaultValidationExecutor =
  (workspace: Workspace): WorkflowValidationCommandExecutor =>
  async (command) => {
    const base = { command: command.command, reason: command.reason, kind: inferValidationKind(command) };
    try {
      return { ...base, status: "passed", exitCode: 0, stdout: await spawnShell(workspace, command.command) };
    } catch (error) {
      const commandError = error as { code?: number | null; stdout?: string; stderr?: string; message?: string };
      return {
        ...base,
        status: "failed",
        exitCode: commandError.code ?? 1,
        failureScope: classifyValidationFailure(command, commandError),
        stdout: commandError.stdout,
        stderr: commandError.stderr ?? commandError.message,
      };
    }
  };

const readJsonFile = async (filePath: string) => JSON.parse(await readFile(resolvePath(filePath), "utf8"));

const workflowDiagnosticFromDoctor = (
  {
    severity,
    code,
    message,
    scope,
    context,
  }: Pick<WorkflowDiagnostic, "severity" | "code" | "message" | "scope" | "context">,
  fallbackScope: "baseline" | "workflow",
): WorkflowDiagnostic => {
  const resolvedScope = scope ?? fallbackScope;
  const failureScope =
    resolvedScope === "baseline" ? "workspace-config" : resolvedScope === "workflow" ? "source-change" : "unknown";
  return { severity, code, message, scope: resolvedScope, failureScope, context };
};

interface BaselineBlockerCache {
  schemaVersion: 1;
  workflow: string;
  blockers: {
    fingerprint: string;
    code: string;
    message: string;
    failureScope: WorkflowFailureScope;
    command?: string;
    kind?: WorkflowValidationKind;
    lastSeenAt: string;
  }[];
}

const baselineBlockerCachePath = (workflow: string) => `.akan/workflows/baseline/${workflow}.json`;

const blockerFingerprint = (blocker: WorkflowKnownBlocker) =>
  [blocker.failureScope, blocker.code, blocker.command ?? "", blocker.kind ?? "", blocker.message].join("|");

const applyBaselineBlockerCache = async (workspace: Workspace, report: WorkflowValidationRunReport) => {
  const cacheableBlockers = report.knownBlockers.filter(
    (blocker) => blocker.failureScope === "workspace-config" || blocker.failureScope === "environment",
  );
  if (cacheableBlockers.length === 0) return report;

  const cachePath = baselineBlockerCachePath(report.workflow);
  const cached = ((await workspace.exists(cachePath))
    ? ((await workspace.readJson(cachePath)) as BaselineBlockerCache)
    : null) ?? { schemaVersion: 1, workflow: report.workflow, blockers: [] };
  const knownFingerprints = new Set(cached.blockers.map((blocker) => blocker.fingerprint));
  const now = new Date().toISOString();
  const blockers = new Map(cached.blockers.map((blocker) => [blocker.fingerprint, blocker]));

  for (const blocker of cacheableBlockers) {
    const fingerprint = blockerFingerprint(blocker);
    blockers.set(fingerprint, {
      fingerprint,
      code: blocker.code,
      message: blocker.message,
      failureScope: blocker.failureScope,
      command: blocker.command,
      kind: blocker.kind,
      lastSeenAt: now,
    });
  }

  await workspace.writeFile(
    cachePath,
    jsonText({ schemaVersion: 1, workflow: report.workflow, blockers: [...blockers.values()] }),
    { silent: true },
  );

  const knownBlockers = report.knownBlockers.map((blocker) => {
    if (!knownFingerprints.has(blockerFingerprint(blocker))) return blocker;
    return {
      ...blocker,
      known: true,
      message: `Known baseline blocker, unrelated to this source change: ${blocker.message}`,
    };
  });
  return {
    ...report,
    knownBlockers,
    baselineSummary: {
      ...report.baselineSummary,
      knownBlockerCount: knownBlockers.filter((blocker) => blocker.known).length,
    },
  };
};

const withBaselineDetailsPolicy = (report: WorkflowValidationRunReport, includeBaselineDetails: boolean) => {
  const baselineDiagnostics = report.baselineDiagnostics ?? [];
  return {
    ...report,
    baselineSummary: createWorkflowBaselineSummary(baselineDiagnostics, {
      detailsIncluded: includeBaselineDetails,
      knownBlockerCount: report.knownBlockers.filter((blocker) => blocker.known).length,
    }),
    baselineDiagnostics: includeBaselineDetails ? baselineDiagnostics : [],
  };
};

export class WorkflowRunner extends runner("workflow") {
  static stepRegistry(workspace: Workspace) {
    return createWorkflowStepRegistry({
      workspace,
      createModule: (sys, module) => CommandContainer.get(ModuleScript).createModuleTemplate(sys, module),
      createScalar: (sys, scalar) => CommandContainer.get(ScalarScript).createScalar(sys, scalar),
      createUi: (input) => CommandContainer.get(PrimitiveScript).createUi(workspace, input),
      addField: (input) => CommandContainer.get(PrimitiveScript).addField(workspace, input),
      addEnumField: (input) => CommandContainer.get(PrimitiveScript).addEnumField(workspace, input),
      addMutation: (input) => CommandContainer.get(PrimitiveScript).addMutation(workspace, input),
      addSlice: (input) => CommandContainer.get(PrimitiveScript).addSlice(workspace, input),
      createInteraction: (input) => CommandContainer.get(PrimitiveScript).createInteraction(workspace, input),
    });
  }

  list({ format = "markdown" }: { format?: WorkflowFormat } = {}) {
    const workflows = listWorkflowSpecs(workflowSpecs);
    if (format === "json")
      return jsonText({
        schemaVersion: 1,
        workflows: workflows.map(({ name, description, whenToUse, replacesRules = [] }) => ({
          name,
          description,
          whenToUse,
          replacesRules,
        })),
      });
    return renderWorkflowList(workflows);
  }

  explain(workflow: string, { format = "markdown" }: { format?: WorkflowFormat } = {}) {
    const spec = getWorkflowSpec(workflowSpecs, workflow);
    if (!spec) throw new Error(`Unknown workflow: ${workflow}. Run \`akan workflow list\` to see available workflows.`);
    return format === "json" ? jsonText(spec) : renderWorkflowExplain(spec);
  }

  async plan(
    workflow: string,
    inputs: WorkflowPlanInputs,
    {
      format = "markdown",
      out = null,
      workspace,
    }: { format?: WorkflowFormat; out?: string | null; workspace?: Workspace } = {},
  ) {
    const spec = getWorkflowSpec(workflowSpecs, workflow);
    if (!spec) throw new Error(`Unknown workflow: ${workflow}. Run \`akan workflow list\` to see available workflows.`);
    const plan = await inspectWorkflowPlan(
      workspace ?? WorkspaceExecutor.fromRoot(),
      createWorkflowPlan(spec, compactWorkflowInputs(inputs)),
    );
    if (out) {
      const outPath = resolvePath(out);
      await mkdir(path.dirname(outPath), { recursive: true });
      await writeFile(outPath, jsonText(plan));
    }
    return format === "json" ? jsonText(plan) : renderWorkflowPlan(plan);
  }

  async apply(
    planPath: string,
    {
      dryRun = false,
      format = "markdown",
      registry,
      workspace,
    }: { dryRun?: boolean; format?: WorkflowFormat; registry?: WorkflowStepRegistry; workspace?: Workspace } = {},
  ) {
    const renderApplyReport = async (report: WorkflowApplyReport) => {
      if (!workspace) return renderWorkflowApply(report, format);
      const { artifact } = await writeWorkflowRunArtifact(workspace, report);
      return renderWorkflowApply(artifact as WorkflowApplyReport, format);
    };
    let plan: WorkflowPlan;
    try {
      const parsed = await readJsonFile(planPath);
      if (!isWorkflowPlan(parsed))
        return await renderApplyReport(
          failedApplyReport("unknown", "workflow-plan-invalid", `Workflow plan file is invalid: ${planPath}.`),
        );
      plan = parsed;
    } catch (error) {
      const message = `Could not read workflow plan file: ${planPath}. ${error instanceof Error ? error.message : ""}`;
      return await renderApplyReport(failedApplyReport("unknown", "workflow-plan-read-failed", message.trim()));
    }

    const spec = getWorkflowSpec(workflowSpecs, plan.workflow);
    if (!spec) {
      const message = `Unknown workflow in plan: ${plan.workflow}.`;
      return await renderApplyReport(failedApplyReport(plan.workflow, "workflow-unknown", message, plan));
    }
    if (dryRun) return await renderApplyReport(createDryRunWorkflowApplyReport(plan));
    if (!registry) {
      const message = "Workflow apply requires a step runner registry.";
      return await renderApplyReport(failedApplyReport(plan.workflow, "workflow-registry-missing", message, plan));
    }
    return await renderApplyReport(await new WorkflowExecutor(registry, workspace).apply(plan));
  }

  async validate(
    runIdOrPlan: string,
    {
      format = "markdown",
      workspace,
      execute,
      includeBaselineDetails = false,
    }: {
      format?: WorkflowFormat;
      workspace: Workspace;
      execute?: WorkflowValidationCommandExecutor;
      includeBaselineDetails?: boolean;
    },
  ) {
    const loaded = await this.loadValidationTarget(runIdOrPlan, workspace);
    const doctor = await AkanContextAnalyzer.doctor(workspace, {
      strict: true,
      runIdOrPlan,
      changedFiles: loaded.changedFiles,
    });
    const report = withBaselineDetailsPolicy(
      await applyBaselineBlockerCache(
        workspace,
        await createWorkflowValidationRunReport({
          workflow: loaded.plan?.workflow ?? loaded.workflow,
          source: loaded.source,
          plan: loaded.plan,
          commands: loaded.commands,
          execute: execute ?? defaultValidationExecutor(workspace),
          diagnostics: loaded.diagnostics,
          baselineDiagnostics: (doctor.baselineDiagnostics ?? []).map((diagnostic) =>
            workflowDiagnosticFromDoctor(diagnostic, "baseline"),
          ),
          workflowDiagnostics: (doctor.workflowDiagnostics ?? []).map((diagnostic) =>
            workflowDiagnosticFromDoctor(diagnostic, "workflow"),
          ),
          repairActions: loaded.repairActions,
        }),
      ),
      includeBaselineDetails,
    );
    await writeWorkflowRunArtifact(workspace, report);
    return renderWorkflowValidation(report, format);
  }

  async report(runId: string, { format = "markdown", workspace }: { format?: WorkflowFormat; workspace: Workspace }) {
    try {
      return renderWorkflowRunArtifact(await readWorkflowRunArtifact(workspace, runId), format);
    } catch (error) {
      const report = await createWorkflowValidationRunReport({
        runId,
        workflow: "unknown",
        source: { type: "run-report", runId },
        commands: [],
        execute: async (command) => ({
          command: command.command,
          reason: command.reason,
          status: "failed",
          exitCode: 1,
        }),
        diagnostics: [
          {
            severity: "error",
            code: "workflow-run-read-failed",
            message:
              `Could not read workflow run report: ${runId}. ${error instanceof Error ? error.message : ""}`.trim(),
          },
        ],
      });
      return renderWorkflowValidation(report, format);
    }
  }

  async loadValidationTarget(runIdOrPlan: string, workspace: Workspace) {
    const unreadable = (code: string, message: string) => ({
      workflow: "unknown",
      source: { type: "run-report" as const, runId: runIdOrPlan },
      plan: undefined,
      commands: [] as WorkflowApplyCommand[],
      diagnostics: [{ severity: "error" as const, code, message }],
      changedFiles: [],
      repairActions: [],
    });
    const loadFromArtifact = (artifact: WorkflowRunArtifact, sourcePath: string) => {
      if (isWorkflowApplyReport(artifact)) {
        return {
          workflow: artifact.workflow,
          source: { type: "apply-report" as const, path: sourcePath, runId: artifact.runId },
          plan: artifact.plan,
          commands: artifact.recommendedValidationCommands.length
            ? artifact.recommendedValidationCommands
            : workflowCommandsForPlan(artifact.plan),
          diagnostics: artifact.diagnostics,
          changedFiles: artifact.changedFiles.map((file) => file.path),
          repairActions: [],
        };
      }
      if ("mode" in artifact && artifact.mode === "validate") {
        return {
          workflow: artifact.workflow,
          source: { type: "run-report" as const, runId: artifact.runId },
          plan: artifact.plan,
          commands: artifact.plan ? workflowCommandsForPlan(artifact.plan) : [],
          diagnostics: artifact.diagnostics,
          changedFiles: [],
          repairActions: artifact.repairActions,
        };
      }
      return unreadable(
        "workflow-validation-source-unsupported",
        `Workflow validation source is not supported: ${runIdOrPlan}.`,
      );
    };

    try {
      const parsed = await readJsonFile(runIdOrPlan);
      if (isWorkflowPlan(parsed)) {
        return {
          workflow: parsed.workflow,
          source: { type: "plan" as const, path: resolvePath(runIdOrPlan) },
          plan: parsed,
          commands: workflowCommandsForPlan(parsed),
          diagnostics: parsed.diagnostics,
          changedFiles: workflowPathsForPlan(parsed),
          repairActions: [],
        };
      }
      if (isWorkflowRunArtifact(parsed)) return loadFromArtifact(parsed, resolvePath(runIdOrPlan));
    } catch {
      // If it is not a readable path, treat it as a run id below.
    }

    try {
      const artifact = await readWorkflowRunArtifact(workspace, runIdOrPlan);
      return loadFromArtifact(artifact, runIdOrPlan);
    } catch (error) {
      const message = `Could not read workflow validation source: ${runIdOrPlan}. ${error instanceof Error ? error.message : ""}`;
      return unreadable("workflow-validation-source-read-failed", message.trim());
    }
  }
}
