import type { Workspace } from "../commandDecorators";
import type {
  GeneratedSyncState,
  PrimitiveChangedFile,
  PrimitiveGeneratedFile,
  RepairAction,
  RepairReport,
  WorkflowApplyCommand,
  WorkflowApplyReport,
  WorkflowBaselineSummary,
  WorkflowDiagnostic,
  WorkflowFailureScope,
  WorkflowKnownBlocker,
  WorkflowNextActionCode,
  WorkflowOverallStatus,
  WorkflowPlan,
  WorkflowRunArtifact,
  WorkflowRunSource,
  WorkflowValidationCommandResult,
  WorkflowValidationRunReport,
  WorkflowValidationStatus,
} from "./types";
import { commandStatus, jsonText, uniqueBy, workflowStatus } from "./utils";

const sourceChangeBlocked = (diagnostics: readonly WorkflowDiagnostic[]) =>
  diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === "error" &&
      (diagnostic.failureScope === "source-change" ||
        !diagnostic.failureScope ||
        diagnostic.failureScope === "unknown"),
  );

export const workflowPlanApproval = {
  required: true,
  meaning: "Review this read-only plan before apply_workflow mutates files.",
  applyTool: "apply_workflow",
} as const;

const inferNextActionCode = (
  action: { action?: WorkflowNextActionCode; command: string },
  diagnostics: readonly WorkflowDiagnostic[],
): WorkflowNextActionCode => {
  if (action.action) return action.action;
  if (sourceChangeBlocked(diagnostics) && action.command.startsWith("akan workflow explain")) return "blocked";
  if (action.command.startsWith("akan workflow repair")) return "repair";
  if (action.command.startsWith("akan workflow explain")) return "manual-review";
  if (action.command.startsWith("akan ")) return "validate";
  return "answer";
};

const nextActionPriority = (
  action: { action?: WorkflowNextActionCode },
  diagnostics: readonly WorkflowDiagnostic[],
) => {
  const priority = sourceChangeBlocked(diagnostics)
    ? { blocked: 0, repair: 1, "manual-review": 2, validate: 3, answer: 4 }
    : { "manual-review": 0, validate: 1, repair: 2, blocked: 3, answer: 4 };
  return priority[action.action ?? "answer"];
};

export const createWorkflowApplyReport = ({
  workflow,
  mode,
  changedFiles = [],
  generatedFiles = [],
  appliedCommands = [],
  recommendedValidationCommands,
  commands = [],
  diagnostics = [],
  postApplyChecks = [],
  recommendations = [],
  nextActions = [],
  plan,
}: Omit<
  WorkflowApplyReport,
  | "schemaVersion"
  | "runId"
  | "applyReportPath"
  | "validationTarget"
  | "status"
  | "summary"
  | "appliedCommands"
  | "recommendedValidationCommands"
  | "commands"
  | "postApplyChecks"
  | "recommendations"
> & {
  appliedCommands?: WorkflowApplyCommand[];
  recommendedValidationCommands?: WorkflowApplyCommand[];
  commands?: WorkflowApplyCommand[];
  postApplyChecks?: WorkflowApplyReport["postApplyChecks"];
  recommendations?: WorkflowApplyReport["recommendations"];
}): WorkflowApplyReport => {
  const validationCommands = recommendedValidationCommands ?? commands;
  const nextActionsWithIntent = nextActions.map((action) => ({
    ...action,
    action: inferNextActionCode(action, diagnostics),
  }));
  if (sourceChangeBlocked(diagnostics) && !nextActionsWithIntent.some((action) => action.action === "blocked")) {
    nextActionsWithIntent.unshift({
      command: `akan workflow explain ${workflow}`,
      reason: "Review source-change blockers before running validation.",
      action: "blocked",
    });
  }
  const orderedNextActions = uniqueBy(nextActionsWithIntent, (action) => action.command).sort(
    (left, right) => nextActionPriority(left, diagnostics) - nextActionPriority(right, diagnostics),
  );
  const sourceFilesChanged = uniqueBy(changedFiles, (file) => `${file.action}:${file.path}:${file.reason}`);
  const generatedFilesSynced = uniqueBy(generatedFiles, (file) => `${file.action}:${file.path}:${file.reason}`);
  return {
    schemaVersion: 1,
    workflow,
    mode,
    status: workflowStatus(diagnostics),
    summary: {
      sourceFilesChanged,
      generatedFilesSynced,
    },
    changedFiles: sourceFilesChanged,
    generatedFiles: generatedFilesSynced,
    appliedCommands: uniqueBy(appliedCommands, (command) => command.command),
    recommendedValidationCommands: uniqueBy(validationCommands, (command) => command.command),
    commands: uniqueBy(validationCommands, (command) => command.command),
    diagnostics,
    postApplyChecks,
    recommendations: uniqueBy(recommendations, (recommendation) => `${recommendation.kind}:${recommendation.code}`),
    nextActions: orderedNextActions.slice(0, 3),
    plan,
  };
};

export const resolveWorkflowCommand = (command: string, plan: WorkflowPlan) => {
  const target = typeof plan.inputs.app === "string" ? plan.inputs.app : "<app-or-lib>";
  return command
    .replaceAll("<app-or-lib-or-pkg>", target)
    .replaceAll("<app-or-lib>", target)
    .replaceAll("<app-name>", target);
};

export const workflowCommandsForPlan = (plan: WorkflowPlan) =>
  plan.validation.map((validation) => ({
    command: resolveWorkflowCommand(validation.command, plan),
    reason: validation.reason,
    kind: validation.kind,
  })) satisfies WorkflowApplyCommand[];

export const workflowRunsDir = ".akan/workflows/runs";

export const createWorkflowRunId = (prefix = "run") =>
  `${prefix}-${new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;

const getRunId = (artifact: WorkflowRunArtifact) => {
  if ("runId" in artifact && artifact.runId) return artifact.runId;
  return createWorkflowRunId("mode" in artifact ? artifact.mode : artifact.kind);
};

export const workflowRunArtifactPath = (runId: string) => `${workflowRunsDir}/${runId}.json`;

const withWorkflowRunMetadata = (
  artifact: WorkflowRunArtifact,
  runId: string,
  artifactPath: string,
): WorkflowRunArtifact => {
  if ("mode" in artifact && (artifact.mode === "apply" || artifact.mode === "dry-run")) {
    return { ...artifact, runId, applyReportPath: artifactPath, validationTarget: artifactPath };
  }
  if ("kind" in artifact) return { ...artifact, runId, repairReportPath: artifactPath };
  return artifact;
};

export const writeWorkflowRunArtifact = async (workspace: Workspace, artifact: WorkflowRunArtifact) => {
  const runId = getRunId(artifact);
  const artifactPath = workflowRunArtifactPath(runId);
  const artifactWithMetadata = withWorkflowRunMetadata(artifact, runId, artifactPath);
  await workspace.writeFile(artifactPath, jsonText(artifactWithMetadata), { silent: true });
  return { runId, path: artifactPath, artifact: artifactWithMetadata };
};

export const workflowSyncDir = ".akan/workflows/sync";

const syncStateSlug = (target: string) =>
  target
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

export const workflowSyncStatePath = (target: string) => `${workflowSyncDir}/${syncStateSlug(target) || "target"}.json`;

export const generatedFilePathsForTarget = (targetRoot: string, reason = "Generated files were refreshed by sync.") =>
  [
    { path: `${targetRoot}/lib/cnst.ts`, action: "sync", reason },
    { path: `${targetRoot}/lib/dict.ts`, action: "sync", reason },
    { path: `${targetRoot}/lib/index.ts`, action: "sync", reason },
  ] satisfies PrimitiveGeneratedFile[];

export const writeGeneratedSyncState = async (workspace: Workspace, state: GeneratedSyncState) => {
  const statePath = workflowSyncStatePath(state.target);
  await workspace.writeFile(statePath, jsonText(state), { silent: true });
  return statePath;
};

export const readWorkflowRunArtifact = async (workspace: Workspace, runId: string) => {
  const artifactPath = workflowRunArtifactPath(runId);
  if (!(await workspace.exists(artifactPath))) throw new Error(`Workflow run artifact does not exist: ${artifactPath}`);
  return (await workspace.readJson(artifactPath)) as WorkflowRunArtifact;
};

export type WorkflowValidationCommandExecutor = (
  command: WorkflowApplyCommand,
) => Promise<WorkflowValidationCommandResult>;

const failedCommandScopes = (commands: readonly WorkflowValidationCommandResult[]) =>
  commands.filter((command) => command.status === "failed").map((command) => command.failureScope ?? "unknown");

const errorDiagnosticScopes = (diagnostics: readonly WorkflowDiagnostic[]) =>
  diagnostics
    .filter((diagnostic) => diagnostic.severity === "error")
    .map(
      (diagnostic) =>
        diagnostic.failureScope ??
        (diagnostic.scope === "baseline"
          ? "workspace-config"
          : diagnostic.scope === "workflow"
            ? "source-change"
            : "unknown"),
    );

const hasScopeFailure = (
  scopes: readonly WorkflowFailureScope[],
  scope: WorkflowFailureScope,
  diagnostics: readonly WorkflowDiagnostic[] = [],
) =>
  scopes.includes(scope) ||
  diagnostics.some((diagnostic) => diagnostic.severity === "error" && diagnostic.failureScope === scope);

const statusForScope = (
  commands: readonly WorkflowValidationCommandResult[],
  diagnostics: readonly WorkflowDiagnostic[],
  scopes: readonly WorkflowFailureScope[],
  expectedScope: WorkflowFailureScope,
): WorkflowValidationStatus => {
  const hasCommands = commands.length > 0 || diagnostics.length > 0;
  if (!hasCommands) return "unknown";
  return hasScopeFailure(scopes, expectedScope, diagnostics) ? "failed" : "passed";
};

const statusForValidationKind = (
  commands: readonly WorkflowValidationCommandResult[],
  kind: WorkflowValidationCommandResult["kind"],
): WorkflowValidationStatus => {
  const matching = commands.filter((command) => command.kind === kind);
  if (matching.length === 0) return "unknown";
  return matching.some((command) => command.status === "failed") ? "failed" : "passed";
};

const statusForCommands = (commands: readonly WorkflowValidationCommandResult[]): WorkflowValidationStatus => {
  if (commands.length === 0) return "unknown";
  return commandStatus(commands) === "failed" ? "failed" : "passed";
};

const statusForDiagnostics = (diagnostics: readonly WorkflowDiagnostic[]): WorkflowValidationStatus => {
  if (diagnostics.length === 0) return "unknown";
  return workflowStatus(diagnostics) === "failed" ? "failed" : "passed";
};

const workflowDiagnosticContextPaths = (diagnostics: readonly WorkflowDiagnostic[]) =>
  uniqueBy(
    diagnostics.flatMap((diagnostic) => diagnostic.context?.paths ?? []),
    (filePath) => filePath,
  );

export const createWorkflowBaselineSummary = (
  diagnostics: readonly WorkflowDiagnostic[],
  { detailsIncluded = true, knownBlockerCount = 0 }: { detailsIncluded?: boolean; knownBlockerCount?: number } = {},
): WorkflowBaselineSummary => {
  const grouped = new Map<string, WorkflowBaselineSummary["byCode"][number]>();
  let totalErrors = 0;
  let totalWarnings = 0;
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === "error") totalErrors += 1;
    else totalWarnings += 1;
    const existing = grouped.get(diagnostic.code);
    if (existing) {
      existing.count += 1;
      if (existing.severity !== diagnostic.severity) existing.severity = "mixed";
    } else {
      grouped.set(diagnostic.code, {
        code: diagnostic.code,
        severity: diagnostic.severity,
        count: 1,
        sampleMessage: diagnostic.message,
      });
    }
  }
  const contextPaths = workflowDiagnosticContextPaths(diagnostics);
  return {
    status: totalErrors > 0 ? "failed" : diagnostics.length > 0 ? "passed" : "unknown",
    total: diagnostics.length,
    totalErrors,
    totalWarnings,
    detailsIncluded,
    knownBlockerCount,
    byCode: [...grouped.values()],
    ...(contextPaths.length ? { contextPaths } : {}),
  };
};

const createKnownBlockers = (
  commands: readonly WorkflowValidationCommandResult[],
  diagnostics: readonly WorkflowDiagnostic[],
): WorkflowKnownBlocker[] => {
  const commandBlockers = commands
    .filter(
      (command) =>
        command.status === "failed" &&
        (command.failureScope === "workspace-config" || command.failureScope === "environment"),
    )
    .map((command) => ({
      code: `workflow-validation-${command.failureScope}`,
      message: `${command.failureScope === "environment" ? "Environment" : "Workspace configuration"} blocker: ${command.command}`,
      failureScope: command.failureScope ?? "unknown",
      command: command.command,
      kind: command.kind,
      count: 1,
    }));
  const diagnosticBlockers = diagnostics
    .filter(
      (diagnostic) =>
        diagnostic.severity === "error" &&
        (diagnostic.failureScope === "workspace-config" ||
          diagnostic.failureScope === "environment" ||
          diagnostic.scope === "baseline"),
    )
    .map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.message,
      failureScope: diagnostic.failureScope ?? ("workspace-config" as const),
      command: diagnostic.command,
      kind: diagnostic.kind,
      count: 1,
    }));
  const grouped = new Map<string, WorkflowKnownBlocker>();
  for (const blocker of [...commandBlockers, ...diagnosticBlockers]) {
    const key = `${blocker.failureScope}:${blocker.code}:${blocker.command ?? ""}:${blocker.message}`;
    const existing = grouped.get(key);
    if (existing) existing.count += blocker.count;
    else grouped.set(key, blocker);
  }
  return [...grouped.values()];
};

const createValidationStatuses = (
  commands: readonly WorkflowValidationCommandResult[],
  reportDiagnostics: readonly WorkflowDiagnostic[],
  baselineDiagnostics: readonly WorkflowDiagnostic[],
  workflowDiagnostics: readonly WorkflowDiagnostic[],
): {
  sourceStatus: WorkflowValidationStatus;
  workspaceStatus: WorkflowValidationStatus;
  validationCommandsStatus: WorkflowValidationStatus;
  baselineStatus: WorkflowValidationStatus;
  overallStatus: WorkflowOverallStatus;
  summary: {
    sourceChange: WorkflowValidationStatus;
    generatedSync: WorkflowValidationStatus;
    validationCommands: WorkflowValidationStatus;
    baseline: WorkflowValidationStatus;
    workspaceConfig: WorkflowValidationStatus;
    environment: WorkflowValidationStatus;
  };
} => {
  const diagnostics = [...reportDiagnostics, ...baselineDiagnostics, ...workflowDiagnostics];
  const scopes = [...failedCommandScopes(commands), ...errorDiagnosticScopes(diagnostics)];
  const sourceDiagnostics = [...reportDiagnostics, ...workflowDiagnostics].filter(
    (diagnostic) =>
      diagnostic.failureScope === "source-change" ||
      diagnostic.scope === "workflow" ||
      (!diagnostic.failureScope && diagnostic.scope !== "baseline"),
  );
  const sourceScopes = [...failedCommandScopes(commands), ...errorDiagnosticScopes(sourceDiagnostics)];
  const sourceStatus = statusForScope(commands, sourceDiagnostics, sourceScopes, "source-change");
  const validationCommandsStatus = statusForCommands(commands);
  const baselineStatus = statusForDiagnostics(baselineDiagnostics);
  const nonBaselineDiagnostics = [...reportDiagnostics, ...workflowDiagnostics];
  const workspaceStatus =
    hasScopeFailure(scopes, "workspace-config", diagnostics) || hasScopeFailure(scopes, "environment", diagnostics)
      ? "failed"
      : commands.length || diagnostics.length
        ? "passed"
        : "unknown";
  const overallStatus = hasScopeFailure(scopes, "source-change", diagnostics)
    ? "failed"
    : validationCommandsStatus === "passed" &&
        baselineStatus === "failed" &&
        workflowStatus(nonBaselineDiagnostics) !== "failed"
      ? "passed-with-baseline-blockers"
      : hasScopeFailure(scopes, "workspace-config", diagnostics)
        ? "blocked-by-workspace-config"
        : hasScopeFailure(scopes, "environment", diagnostics)
          ? "blocked-by-environment"
          : workflowStatus(diagnostics) === "failed" || commandStatus(commands) === "failed"
            ? "failed"
            : "passed";
  return {
    sourceStatus,
    workspaceStatus,
    validationCommandsStatus,
    baselineStatus,
    overallStatus,
    summary: {
      sourceChange: sourceStatus,
      generatedSync: statusForValidationKind(commands, "sync"),
      validationCommands: validationCommandsStatus,
      baseline: baselineStatus,
      workspaceConfig: statusForScope(commands, diagnostics, scopes, "workspace-config"),
      environment: statusForScope(commands, diagnostics, scopes, "environment"),
    },
  };
};

export const createWorkflowValidationRunReport = async ({
  runId = createWorkflowRunId("validation"),
  workflow,
  source,
  plan,
  commands,
  execute,
  diagnostics = [],
  baselineDiagnostics = [],
  workflowDiagnostics = [],
  repairActions = [],
}: {
  runId?: string;
  workflow: string;
  source: WorkflowRunSource;
  plan?: WorkflowPlan;
  commands: WorkflowApplyCommand[];
  execute: WorkflowValidationCommandExecutor;
  diagnostics?: WorkflowDiagnostic[];
  baselineDiagnostics?: WorkflowDiagnostic[];
  workflowDiagnostics?: WorkflowDiagnostic[];
  repairActions?: RepairAction[];
}): Promise<WorkflowValidationRunReport> => {
  const results: WorkflowValidationCommandResult[] = [];
  for (const command of commands) {
    results.push(await execute(command));
  }
  const commandDiagnostics = results.flatMap((result) =>
    result.status === "failed"
      ? [
          {
            severity: "error" as const,
            code: "workflow-validation-command-failed",
            message: `Validation command failed: ${result.command}`,
            command: result.command,
            kind: result.kind,
            failureScope: result.failureScope,
          },
        ]
      : [],
  );
  const reportDiagnostics = [...diagnostics, ...commandDiagnostics];
  const scopedDiagnostics = [...reportDiagnostics, ...baselineDiagnostics, ...workflowDiagnostics];
  const knownBlockers = createKnownBlockers(results, scopedDiagnostics);
  const statuses = createValidationStatuses(results, reportDiagnostics, baselineDiagnostics, workflowDiagnostics);
  return {
    schemaVersion: 1,
    runId,
    workflow,
    mode: "validate",
    source,
    status: statuses.overallStatus === "passed" ? "passed" : "failed",
    ...statuses,
    knownBlockers,
    commands: results,
    diagnostics: reportDiagnostics,
    baselineSummary: createWorkflowBaselineSummary(baselineDiagnostics, {
      knownBlockerCount: knownBlockers.filter((blocker) => blocker.failureScope === "workspace-config").length,
    }),
    baselineDiagnostics,
    workflowDiagnostics,
    repairActions: uniqueBy(repairActions, (action) => action.command),
    nextActions: results
      .filter((result) => result.status === "failed")
      .map((result) => ({ command: result.command, reason: "Re-run this validation command after repair." })),
    plan,
  };
};

export const createDryRunWorkflowApplyReport = (plan: WorkflowPlan) => {
  const changedFiles: PrimitiveChangedFile[] = plan.predictedChanges.flatMap((change) => {
    if (change.action !== "create" && change.action !== "modify") return [];
    return [
      {
        path: change.target,
        action: change.action,
        reason: change.reason,
      },
    ];
  });
  const generatedFiles: PrimitiveGeneratedFile[] = plan.predictedChanges.flatMap((change) => {
    if (change.action !== "sync") return [];
    return [
      {
        path: change.target,
        action: "sync",
        reason: change.reason,
      },
    ];
  });
  const diagnostics = [...plan.diagnostics];
  return createWorkflowApplyReport({
    workflow: plan.workflow,
    mode: "dry-run",
    changedFiles,
    generatedFiles,
    commands: workflowCommandsForPlan(plan),
    diagnostics,
    recommendations: plan.recommendations,
    nextActions: workflowCommandsForPlan(plan),
    plan,
  });
};

export const createRepairReport = ({
  command,
  kind,
  target = null,
  diagnostics = [],
  repairActions = [],
  nextActions = [],
  commands = [],
  generatedFiles = [],
  syncedAt,
}: Omit<
  RepairReport,
  | "schemaVersion"
  | "runId"
  | "repairReportPath"
  | "status"
  | "target"
  | "diagnostics"
  | "repairActions"
  | "nextActions"
  | "commands"
> &
  Partial<
    Pick<
      RepairReport,
      "target" | "diagnostics" | "repairActions" | "nextActions" | "commands" | "generatedFiles" | "syncedAt"
    >
  >): RepairReport => ({
  schemaVersion: 1,
  command,
  kind,
  target,
  status: workflowStatus(diagnostics) === "failed" || commandStatus(commands) === "failed" ? "failed" : "passed",
  diagnostics,
  repairActions: uniqueBy(repairActions, (action) => action.command),
  nextActions: uniqueBy(nextActions, (action) => action.command),
  commands,
  generatedFiles,
  ...(syncedAt ? { syncedAt } : {}),
});
