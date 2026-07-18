import type { Sys, Workspace } from "../commandDecorators";
import type { FieldDefaultValue } from "./source";

export type WorkflowInputType = "string" | "string-list" | "surface-mode" | "boolean";
export type WorkflowSurfaceMode = "infer" | "include" | "skip";
export type WorkflowInputValue = string | string[] | boolean | WorkflowSurfaceMode;
export type WorkflowFormat = "markdown" | "json";
export type WorkflowPlanInputs = Record<string, string | null>;
export type PrimitiveFormat = "markdown" | "json";
export type UiSurface = "view" | "unit" | "template";
export type WorkflowValidationKind = "sync" | "lint" | "typecheck" | "doctor" | "custom";
export type WorkflowFailureScope = "workspace-config" | "environment" | "source-change" | "unknown";
export type WorkflowValidationStatus = "passed" | "failed" | "unknown";
export interface WorkflowValidationSummary {
  sourceChange: WorkflowValidationStatus;
  generatedSync: WorkflowValidationStatus;
  validationCommands: WorkflowValidationStatus;
  baseline: WorkflowValidationStatus;
  workspaceConfig: WorkflowValidationStatus;
  environment: WorkflowValidationStatus;
}
export type WorkflowOverallStatus =
  | "passed"
  | "failed"
  | "passed-with-baseline-blockers"
  | "blocked-by-workspace-config"
  | "blocked-by-environment";

export interface PrimitiveTargetInput {
  app: string | null;
  module: string | null;
}

export interface AddFieldInput extends PrimitiveTargetInput {
  field: string | null;
  type: string | null;
  defaultValue?: FieldDefaultValue;
  surfaces?: string[] | null;
  includeInLight?: boolean | null;
}

export interface AddEnumFieldInput extends PrimitiveTargetInput {
  field: string | null;
  values: string | null;
  defaultValue?: FieldDefaultValue;
  surfaces?: string[] | null;
  includeInLight?: boolean | null;
}

export interface AddMutationInput extends PrimitiveTargetInput {
  mutation: string | null;
}

export interface AddSliceInput extends PrimitiveTargetInput {
  slice: string | null;
}

export interface WorkflowInputSpec {
  type: WorkflowInputType;
  required?: boolean;
  description: string;
  allowedValues?: readonly string[];
}

export interface WorkflowStep {
  id: string;
  title: string;
  tool: string;
  description: string;
  when?: string;
}

export interface WorkflowPredictedChange {
  target: string;
  action: "inspect" | "create" | "modify" | "sync" | "validate";
  reason: string;
  applyScope?: "auto" | "manual-review" | "generated-sync" | "validation";
}

export interface WorkflowValidation {
  command: string;
  reason: string;
  kind?: WorkflowValidationKind;
}

export interface WorkflowSpec {
  schemaVersion: 1;
  name: string;
  description: string;
  whenToUse: string;
  inputs: Record<string, WorkflowInputSpec>;
  optionalSurfaces?: Record<string, WorkflowSurfaceMode>;
  steps: readonly WorkflowStep[];
  predictedChanges: readonly WorkflowPredictedChange[];
  validation: readonly WorkflowValidation[];
  completionCriteria: readonly string[];
}

export interface WorkflowDiagnostic {
  severity: "warning" | "error";
  code: string;
  message: string;
  input?: string;
  command?: string;
  kind?: WorkflowValidationKind;
  failureScope?: WorkflowFailureScope;
  scope?: "baseline" | "workflow" | "unknown";
  context?: {
    workflow?: string;
    planPath?: string;
    runId?: string;
    target?: string;
    paths?: string[];
  };
}

export interface WorkflowRecommendation {
  code: string;
  message: string;
  kind: "auto-apply" | "validation" | "manual-action" | "input-guidance" | "import" | "placement" | "ui-component";
  target?: string;
  action?: string;
  confidence?: "high" | "medium" | "low";
}

export interface WorkflowPlanApproval {
  required: true;
  meaning: string;
  applyTool: "apply_workflow";
  canApplyWith?: Record<string, string>;
}

export interface AkanSourceSpan {
  file: string;
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
}

export type AkanIndexedFileKind =
  | "abstract"
  | "constant"
  | "dictionary"
  | "service"
  | "signal"
  | "store"
  | "template"
  | "unit"
  | "util"
  | "view"
  | "zone"
  | "other";

export interface AkanIndexedFile {
  kind: AkanIndexedFileKind;
  path: string;
  expectedPath: string;
  filename: string;
  expectedFilename: string;
  present: boolean;
  casing: "match" | "mismatch" | "missing";
}

export type AkanFieldOutlineKind = "constant" | "dictionary" | "lightProjection";

export interface AkanFieldOutline {
  name: string;
  kind: AkanFieldOutlineKind;
  order: number;
  typeSummary?: string;
  sourceSpan: AkanSourceSpan;
}

export interface AkanProjectionOutline {
  className: string;
  fields: AkanFieldOutline[];
  sourceSpan?: AkanSourceSpan;
}

export interface AkanConstantIndex {
  path: string;
  inputClassName: string;
  builderName: string | null;
  fields: AkanFieldOutline[];
  lightProjection?: AkanProjectionOutline;
  sourceSpan?: AkanSourceSpan;
}

export interface AkanDictionaryIndex {
  path: string;
  modelClassName: string;
  translatorName: string | null;
  fields: AkanFieldOutline[];
  sourceSpan?: AkanSourceSpan;
}

export interface AkanFieldPresence {
  name: string;
  requested: boolean;
  constant: boolean;
  dictionary: boolean;
  lightProjection: boolean;
}

export interface AkanModuleContextIndex {
  schemaVersion: 1;
  app: string;
  module: string;
  moduleClassName: string;
  files: AkanIndexedFile[];
  fieldPresence: AkanFieldPresence[];
  constant?: AkanConstantIndex;
  dictionary?: AkanDictionaryIndex;
  diagnostics: WorkflowDiagnostic[];
}

export type InspectAkanContextRequest =
  | { type: "workspaceOverview" }
  | { type: "moduleContext"; app: string; module: string }
  | { type: "fieldInsertionContext"; app: string; module: string; field: string; fieldType: string }
  | { type: "workflowDiagnostics"; runIdOrPlan: string }
  | { type: "escape"; reason: string; nextStep?: string };

export interface InspectAkanContextProps {
  question: string;
  draft: {
    reason: string;
    type: InspectAkanContextRequest["type"];
  };
  review: string;
  request: InspectAkanContextRequest;
}

export interface AkanContextEvidence {
  kind: "workspace" | "module" | "field-insertion" | "workflow" | "escape";
  summary: string;
  path?: string;
  target?: string;
  sourceSpan?: AkanSourceSpan;
}

export interface AkanContextNext {
  action: "answer" | "inspect" | "plan_workflow" | "validate" | "escape" | "clarify";
  reason: string;
  tool?: string;
  args?: Record<string, unknown>;
}

export interface InspectAkanContextResult {
  schemaVersion: 1;
  type: InspectAkanContextRequest["type"];
  question: string;
  diagnostics: WorkflowDiagnostic[];
  evidence: AkanContextEvidence[];
  next: AkanContextNext;
  data?: Record<string, unknown>;
}

export interface WorkflowPlan {
  schemaVersion: 1;
  workflow: string;
  mode: "plan";
  inputs: Record<string, WorkflowInputValue>;
  optionalSurfaces: Record<string, WorkflowSurfaceMode>;
  steps: readonly WorkflowStep[];
  predictedChanges: readonly WorkflowPredictedChange[];
  validation: readonly WorkflowValidation[];
  diagnostics: WorkflowDiagnostic[];
  recommendations: WorkflowRecommendation[];
  requiresApproval: true;
  approval?: WorkflowPlanApproval;
}

export interface WorkflowReport {
  schemaVersion: 1;
  workflow: string;
  mode: "plan" | "dry-run" | "apply";
  status: "passed" | "failed";
  diagnostics: WorkflowDiagnostic[];
  plan?: WorkflowPlan;
}

export interface WorkflowApplyCommand {
  command: string;
  reason: string;
  stepId?: string;
  kind?: WorkflowValidationKind;
}

export type WorkflowRunSource =
  | { type: "plan"; path: string }
  | { type: "apply-report"; path: string; runId?: string }
  | { type: "run-report"; runId: string };

export interface WorkflowValidationCommandResult {
  command: string;
  reason: string;
  kind?: WorkflowValidationKind;
  status: "passed" | "failed";
  exitCode: number;
  failureScope?: WorkflowFailureScope;
  stdout?: string;
  stderr?: string;
}

export interface WorkflowKnownBlocker {
  code: string;
  message: string;
  failureScope: WorkflowFailureScope;
  command?: string;
  kind?: WorkflowValidationKind;
  count: number;
  known?: boolean;
}

export interface WorkflowBaselineSummaryCode {
  code: string;
  severity: "warning" | "error" | "mixed";
  count: number;
  sampleMessage: string;
}

export interface WorkflowBaselineSummary {
  status: WorkflowValidationStatus;
  total: number;
  totalErrors: number;
  totalWarnings: number;
  detailsIncluded: boolean;
  knownBlockerCount: number;
  byCode: WorkflowBaselineSummaryCode[];
  contextPaths?: string[];
}

export interface RepairAction {
  command: string;
  reason: string;
  kind: "generated" | "format" | "imports" | "dictionary" | "module-shape";
  safeToRun: boolean;
}

export interface PrimitiveChangedFile {
  path: string;
  action: "create" | "modify" | "remove";
  reason: string;
}

export interface WorkflowPostApplyCheck {
  code: string;
  target: string;
  status: "passed" | "failed";
  message: string;
}

export type WorkflowNextActionCode = "answer" | "validate" | "manual-review" | "repair" | "blocked";

export interface PrimitiveGeneratedFile {
  path: string;
  action: "sync";
  reason: string;
}

export interface PrimitiveValidationCommand {
  command: string;
  reason: string;
}

export interface PrimitiveNextAction {
  command: string;
  reason: string;
  action?: WorkflowNextActionCode;
}

export interface PrimitiveWriteReport {
  schemaVersion: 1;
  command: string;
  status: "passed" | "failed";
  changedFiles: PrimitiveChangedFile[];
  generatedFiles: PrimitiveGeneratedFile[];
  validationCommands: PrimitiveValidationCommand[];
  diagnostics: WorkflowDiagnostic[];
  nextActions: PrimitiveNextAction[];
}

export type PrimitiveFileMap = Record<string, { filename: string; content: string }>;

export interface WorkflowApplyReport {
  schemaVersion: 1;
  runId?: string;
  applyReportPath?: string;
  validationTarget?: string;
  workflow: string;
  mode: "dry-run" | "apply";
  status: "passed" | "failed";
  summary: {
    sourceFilesChanged: PrimitiveChangedFile[];
    generatedFilesSynced: PrimitiveGeneratedFile[];
  };
  changedFiles: PrimitiveChangedFile[];
  generatedFiles: PrimitiveGeneratedFile[];
  appliedCommands: WorkflowApplyCommand[];
  recommendedValidationCommands: WorkflowApplyCommand[];
  commands: WorkflowApplyCommand[];
  diagnostics: WorkflowDiagnostic[];
  postApplyChecks?: WorkflowPostApplyCheck[];
  recommendations: WorkflowRecommendation[];
  nextActions: PrimitiveNextAction[];
  plan: WorkflowPlan;
}

export interface WorkflowValidationRunReport {
  schemaVersion: 1;
  runId: string;
  workflow: string;
  mode: "validate";
  source: WorkflowRunSource;
  status: "passed" | "failed";
  sourceStatus: WorkflowValidationStatus;
  workspaceStatus: WorkflowValidationStatus;
  validationCommandsStatus: WorkflowValidationStatus;
  baselineStatus: WorkflowValidationStatus;
  summary: WorkflowValidationSummary;
  overallStatus: WorkflowOverallStatus;
  knownBlockers: WorkflowKnownBlocker[];
  commands: WorkflowValidationCommandResult[];
  diagnostics: WorkflowDiagnostic[];
  baselineSummary: WorkflowBaselineSummary;
  baselineDiagnostics?: WorkflowDiagnostic[];
  workflowDiagnostics?: WorkflowDiagnostic[];
  repairActions: RepairAction[];
  nextActions: PrimitiveNextAction[];
  plan?: WorkflowPlan;
}

export interface RepairReport {
  schemaVersion: 1;
  runId?: string;
  repairReportPath?: string;
  command: string;
  kind: RepairAction["kind"];
  target: string | null;
  status: "passed" | "failed";
  diagnostics: WorkflowDiagnostic[];
  repairActions: RepairAction[];
  nextActions: PrimitiveNextAction[];
  commands: WorkflowValidationCommandResult[];
  generatedFiles?: PrimitiveGeneratedFile[];
  syncedAt?: string;
}

export interface GeneratedSyncState {
  schemaVersion: 1;
  target: string;
  status: "passed" | "failed";
  syncedAt: string;
  command: string;
  runId?: string;
  generatedFiles: PrimitiveGeneratedFile[];
}

export type WorkflowRunArtifact = WorkflowApplyReport | WorkflowValidationRunReport | RepairReport;

export interface WorkflowStepResult {
  changedFiles?: PrimitiveChangedFile[];
  generatedFiles?: PrimitiveGeneratedFile[];
  commands?: WorkflowApplyCommand[];
  diagnostics?: WorkflowDiagnostic[];
  postApplyChecks?: WorkflowPostApplyCheck[];
  recommendations?: WorkflowRecommendation[];
  nextActions?: PrimitiveNextAction[];
}

export type WorkflowStepRunner = (step: WorkflowStep, plan: WorkflowPlan) => Promise<WorkflowStepResult | undefined>;
export type WorkflowStepRegistry = Record<string, WorkflowStepRunner>;

export interface WorkflowPrimitiveOperations {
  workspace: Workspace;
  createModule: (sys: Sys, module: string) => Promise<PrimitiveWriteReport>;
  createScalar: (sys: Sys, scalar: string) => Promise<PrimitiveWriteReport>;
  createUi: (input: PrimitiveTargetInput & { surface: UiSurface }) => Promise<PrimitiveWriteReport>;
  addField: (input: AddFieldInput) => Promise<PrimitiveWriteReport>;
  addEnumField: (input: AddEnumFieldInput) => Promise<PrimitiveWriteReport>;
  addMutation: (input: AddMutationInput) => Promise<PrimitiveWriteReport>;
  addSlice: (input: AddSliceInput) => Promise<PrimitiveWriteReport>;
}
