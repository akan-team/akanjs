import path from "node:path";
import { isRecord } from "akanjs/common";
import type { WorkspaceExecutor } from "../../executors";
import {
  type WorkflowApplyReport,
  type WorkflowPlan,
  type WorkflowRunArtifact,
  workflowPathsForPlan,
  workflowRunArtifactPath,
} from "../../workflow";
import type { AkanDiagnostic } from "../akanContext";
import { safeReadJson } from "../safeRead";

const isWorkflowPlan = (value: unknown): value is WorkflowPlan =>
  typeof value === "object" &&
  value !== null &&
  "schemaVersion" in value &&
  value.schemaVersion === 1 &&
  "mode" in value &&
  value.mode === "plan" &&
  "inputs" in value &&
  isRecord(value.inputs) &&
  "predictedChanges" in value &&
  Array.isArray(value.predictedChanges) &&
  value.predictedChanges.every((change) => isRecord(change) && typeof change.target === "string");

const isPathList = (value: unknown) =>
  Array.isArray(value) && value.every((file) => isRecord(file) && typeof file.path === "string");

const isWorkflowApplyReport = (value: unknown): value is WorkflowApplyReport =>
  typeof value === "object" &&
  value !== null &&
  "schemaVersion" in value &&
  value.schemaVersion === 1 &&
  "mode" in value &&
  (value.mode === "apply" || value.mode === "dry-run") &&
  "changedFiles" in value &&
  isPathList(value.changedFiles) &&
  "generatedFiles" in value &&
  isPathList(value.generatedFiles) &&
  "plan" in value &&
  isWorkflowPlan(value.plan);

const isWorkflowRunArtifact = (value: unknown): value is WorkflowRunArtifact =>
  typeof value === "object" && value !== null && "schemaVersion" in value && value.schemaVersion === 1;

const workflowPathsForArtifact = (artifact: WorkflowRunArtifact) => {
  if (isWorkflowPlan(artifact)) return workflowPathsForPlan(artifact);
  if (isWorkflowApplyReport(artifact)) {
    return [
      ...artifact.changedFiles.map((file) => file.path),
      ...artifact.generatedFiles.map((file) => file.path),
      ...workflowPathsForPlan(artifact.plan),
    ];
  }
  if ("mode" in artifact && artifact.mode === "validate" && isWorkflowPlan(artifact.plan))
    return workflowPathsForPlan(artifact.plan);
  return [];
};

export const loadWorkflowContextPaths = async (
  workspace: WorkspaceExecutor,
  runIdOrPlan: string | null,
  changedFiles: string[],
) => {
  const paths = [...changedFiles];
  if (!runIdOrPlan) return paths;
  const inputPath = path.isAbsolute(runIdOrPlan) ? runIdOrPlan : path.join(workspace.workspaceRoot, runIdOrPlan);
  const artifact =
    (await safeReadJson<WorkflowRunArtifact | WorkflowPlan>(inputPath)) ??
    (await safeReadJson<WorkflowRunArtifact>(path.join(workspace.workspaceRoot, workflowRunArtifactPath(runIdOrPlan))));
  if (artifact && isWorkflowRunArtifact(artifact)) paths.push(...workflowPathsForArtifact(artifact));
  return [...new Set(paths.filter(Boolean))];
};

const withoutPlaceholders = (value: string) =>
  value
    .split("<")
    .map((part, index) => (index === 0 ? part : part.slice(part.indexOf(">") + 1)))
    .join("");

const pathKey = (value: string) =>
  withoutPlaceholders(value.replaceAll("\\", "/").replaceAll("*", ""))
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "");

export const isWorkflowRelatedDiagnostic = (diagnostic: AkanDiagnostic, workflowPaths: string[]) => {
  if (!diagnostic.path) return false;
  const diagnosticPath = pathKey(diagnostic.path);
  return workflowPaths.some((workflowPath) => {
    const candidate = pathKey(workflowPath);
    if (!candidate) return false;
    return (
      diagnosticPath.startsWith(candidate) || candidate.startsWith(diagnosticPath) || diagnosticPath.includes(candidate)
    );
  });
};
