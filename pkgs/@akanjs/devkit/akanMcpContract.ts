import path from "node:path";
import { AkanContextAnalyzer, type AkanModuleContext } from "./akanContext";
import type { Workspace } from "./commandDecorators";
import type {
  AkanContextEvidence,
  AkanContextNext,
  InspectAkanContextProps,
  InspectAkanContextRequest,
  InspectAkanContextResult,
  WorkflowDiagnostic,
  WorkflowPlanInputs,
} from "./workflow";
import { buildAkanModuleContextIndex, createWorkflowBaselineSummary, toolingRolloutGate } from "./workflow";

export type McpToolDefinition = {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
};

const emptySchema = { type: "object" as const, properties: {} };
const stringProperty = { type: "string" };
const booleanProperty = { type: "boolean" };
const objectProperty = { type: "object", additionalProperties: true };
const stringArrayProperty = { type: "array", items: stringProperty };
const inspectAkanContextRequestTypes = [
  "workspaceOverview",
  "moduleContext",
  "fieldInsertionContext",
  "workflowDiagnostics",
  "escape",
] as const;
const inspectAkanContextRequestTypeProperty = { type: "string", enum: inspectAkanContextRequestTypes };
const inspectAkanContextRequestBranches = [
  {
    type: "object",
    properties: { type: { const: "workspaceOverview" } },
    required: ["type"],
  },
  {
    type: "object",
    properties: { type: { const: "moduleContext" }, app: stringProperty, module: stringProperty },
    required: ["type", "app", "module"],
  },
  {
    type: "object",
    properties: {
      type: { const: "fieldInsertionContext" },
      app: stringProperty,
      module: stringProperty,
      field: stringProperty,
      fieldType: stringProperty,
    },
    required: ["type", "app", "module", "field", "fieldType"],
  },
  {
    type: "object",
    properties: { type: { const: "workflowDiagnostics" }, runIdOrPlan: stringProperty },
    required: ["type", "runIdOrPlan"],
  },
  {
    type: "object",
    properties: { type: { const: "escape" }, reason: stringProperty, nextStep: stringProperty },
    required: ["type", "reason"],
  },
];
const inspectAkanContextInputSchema = {
  type: "object" as const,
  properties: {
    question: {
      ...stringProperty,
      description: "The user-facing question the agent is trying to answer before reading source bodies.",
    },
    draft: {
      type: "object",
      properties: {
        reason: stringProperty,
        type: inspectAkanContextRequestTypeProperty,
      },
      required: ["reason", "type"],
    },
    review: {
      ...stringProperty,
      description: "A short self-review explaining why this minimal request is sufficient.",
    },
    request: {
      type: "object",
      properties: {
        type: inspectAkanContextRequestTypeProperty,
        app: stringProperty,
        module: stringProperty,
        field: stringProperty,
        fieldType: stringProperty,
        runIdOrPlan: stringProperty,
        reason: stringProperty,
        nextStep: stringProperty,
      },
      required: ["type"],
      oneOf: inspectAkanContextRequestBranches,
    },
  },
  required: ["question", "draft", "review", "request"],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const slugPart = (value: unknown) =>
  typeof value === "string"
    ? value
        .trim()
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase()
    : "";

const optionalString = (args: Record<string, unknown>, key: string) => {
  const value = args[key];
  return typeof value === "string" && value ? value : undefined;
};

const nestedStringArg = (args: Record<string, unknown>, key: string) => {
  const value = args[key];
  if (typeof value !== "string" || !value) throw new Error(`MCP tool argument "${key}" is required.`);
  return value;
};

const isInspectAkanContextRequestType = (value: unknown): value is InspectAkanContextRequest["type"] =>
  typeof value === "string" && inspectAkanContextRequestTypes.includes(value as InspectAkanContextRequest["type"]);

export const parseJsonOutput = (output: string) => JSON.parse(output) as unknown;

export const workspacePath = (workspace: Workspace, filePath: string) =>
  path.isAbsolute(filePath) ? filePath : path.join(workspace.workspaceRoot, filePath);

export const defaultWorkflowPlanPath = (workflow: string, inputs: WorkflowPlanInputs) => {
  const slug = [
    slugPart(workflow),
    slugPart(inputs.app),
    slugPart(inputs.module),
    slugPart(inputs.field),
    slugPart(inputs.scalar),
    slugPart(inputs.surface),
    slugPart(inputs.mutation),
    slugPart(inputs.slice),
  ]
    .filter(Boolean)
    .join("-");
  return `.akan/workflows/plans/${slug || "workflow-plan"}.json`;
};

export const applyFirstPolicy = {
  mode: "apply-first",
  directSourceEdits: "fallback-only",
  applyRequiredWhen: ["plan_workflow returns planPath", "plan_workflow returns next.tool=apply_workflow"],
  approvalMeaning:
    "requiresApproval is an agent/user review signal before apply_workflow mutates files; it is not a separate MCP permission gate.",
  validationRequiredAfterApply: ["validationTarget", "applyReportPath"],
  fallbackAllowedWhen: [
    "list_workflows and explain_workflow show no matching workflow",
    "apply_workflow reports unsupported/no-op/failed diagnostics that require manual action",
    "recommendations include manual-action follow-up after workflow apply and repairs",
  ],
  baselineDiagnosticsPolicy: "Do not fix unrelated baselineDiagnostics unless the user asks.",
};

export const stringArg = (args: Record<string, unknown>, key: string) => {
  const value = args[key];
  if (typeof value !== "string" || !value) throw new Error(`MCP tool argument "${key}" is required.`);
  return value;
};

export const workflowInputsArg = (args: Record<string, unknown>) => {
  const value = args.inputs;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as WorkflowPlanInputs;
};

export const inspectAkanContextPropsArg = (args: Record<string, unknown>): InspectAkanContextProps => {
  const question = stringArg(args, "question");
  const review = stringArg(args, "review");
  if (!isRecord(args.draft)) throw new Error('MCP tool argument "draft" is required.');
  if (!isRecord(args.request)) throw new Error('MCP tool argument "request" is required.');
  if (!isInspectAkanContextRequestType(args.draft.type)) {
    throw new Error('MCP tool argument "draft.type" must be a supported inspect_akan_context request type.');
  }
  if (!isInspectAkanContextRequestType(args.request.type)) {
    throw new Error('MCP tool argument "request.type" must be a supported inspect_akan_context request type.');
  }
  const draft = { reason: nestedStringArg(args.draft, "reason"), type: args.draft.type };
  const request = args.request;
  if (request.type === "workspaceOverview") return { question, draft, review, request: { type: request.type } };
  if (request.type === "moduleContext")
    return {
      question,
      draft,
      review,
      request: {
        type: request.type,
        app: nestedStringArg(request, "app"),
        module: nestedStringArg(request, "module"),
      },
    };
  if (request.type === "fieldInsertionContext")
    return {
      question,
      draft,
      review,
      request: {
        type: request.type,
        app: nestedStringArg(request, "app"),
        module: nestedStringArg(request, "module"),
        field: nestedStringArg(request, "field"),
        fieldType: nestedStringArg(request, "fieldType"),
      },
    };
  if (request.type === "workflowDiagnostics")
    return {
      question,
      draft,
      review,
      request: { type: request.type, runIdOrPlan: nestedStringArg(request, "runIdOrPlan") },
    };
  return {
    question,
    draft,
    review,
    request: {
      type: "escape",
      reason: nestedStringArg(request, "reason"),
      nextStep: optionalString(request, "nextStep"),
    },
  };
};

export const inspectDiagnostic = (
  severity: WorkflowDiagnostic["severity"],
  code: string,
  message: string,
): WorkflowDiagnostic => ({ severity, code, message });

export const moduleEvidence = (module: AkanModuleContext): AkanContextEvidence => ({
  kind: "module",
  target: `${module.sysName}:${module.name}`,
  path: module.path,
  summary: `${module.kind} module at ${module.path} with ${module.files.length} source file(s).`,
});

export const moduleCandidate = (module: AkanModuleContext) => ({
  app: module.sysName,
  sysType: module.sysType,
  module: module.name,
  kind: module.kind,
  path: module.path,
  files: module.files,
});

export const expectedFieldInsertionFiles = (module: AkanModuleContext) => {
  const sourceFiles = [`${module.name}.constant.ts`, `${module.name}.dictionary.ts`];
  const uiFiles = module.files.filter((file) => file.endsWith(".tsx"));
  return [...sourceFiles, ...uiFiles].map((file) => ({
    path: `${module.path}/${file}`,
    present: module.files.includes(file),
  }));
};

export const readonlyMcpTools: McpToolDefinition[] = [
  {
    name: "inspect_akan_context",
    description:
      "Read-only typed context inspection. Use question -> draft -> review -> request before source body reads; choose fieldInsertionContext for add-field evidence and escape when source body or outside evidence is required.",
    inputSchema: inspectAkanContextInputSchema,
  },
  {
    name: "get_workspace_summary",
    description:
      "Legacy broad workspace summary. Prefer inspect_akan_context.workspaceOverview for typed source-body-free evidence.",
    inputSchema: emptySchema,
  },
  {
    name: "list_apps",
    description: "List Akan apps from the workspace context without reading source bodies.",
    inputSchema: emptySchema,
  },
  {
    name: "list_modules",
    description: "List Akan modules across apps and libs; use inspect_akan_context.moduleContext for typed evidence.",
    inputSchema: emptySchema,
  },
  {
    name: "get_module_context",
    description:
      "Legacy broad module context. Pass app in monorepos; prefer inspect_akan_context.moduleContext or fieldInsertionContext for typed add-field evidence.",
    inputSchema: { type: "object", properties: { app: stringProperty, module: stringProperty }, required: ["module"] },
  },
  {
    name: "get_guideline",
    description: "Return an Akan agent guideline resource by name.",
    inputSchema: { type: "object", properties: { name: stringProperty }, required: ["name"] },
  },
  {
    name: "explain_command",
    description: "Explain one Akan CLI command and its agent-facing workflow policy.",
    inputSchema: { type: "object", properties: { command: stringProperty }, required: ["command"] },
  },
  {
    name: "doctor_workspace",
    description: "Report workspace diagnostics, optionally split into baseline and workflow scopes.",
    inputSchema: {
      type: "object",
      properties: {
        strict: booleanProperty,
        runIdOrPlan: stringProperty,
        changedFiles: stringArrayProperty,
        includeBaselineDetails: booleanProperty,
      },
    },
  },
  {
    name: "get_validation_contract",
    description: "Return validation, artifact chain, and apply-first fallback policy.",
    inputSchema: emptySchema,
  },
];

export const planMcpTools: McpToolDefinition[] = [
  {
    name: "list_workflows",
    description: "List available read-only workflow specs before creating a plan.",
    inputSchema: emptySchema,
  },
  {
    name: "explain_workflow",
    description: "Explain one workflow's inputs, predicted changes, validation, and completion criteria.",
    inputSchema: { type: "object", properties: { workflow: stringProperty }, required: ["workflow"] },
  },
  {
    name: "plan_workflow",
    description:
      "Create a read-only workflow plan after context inspection and return planPath plus next.tool=apply_workflow.",
    inputSchema: {
      type: "object",
      properties: { workflow: stringProperty, inputs: objectProperty, out: stringProperty },
      required: ["workflow"],
    },
  },
];

export const applyMcpTools: McpToolDefinition[] = [
  {
    name: "apply_workflow",
    description: "Apply a stored workflow plan before direct edits and return validationTarget for run_validation.",
    inputSchema: {
      type: "object",
      properties: { planPath: stringProperty, dryRun: booleanProperty },
      required: ["planPath"],
    },
  },
  {
    name: "run_validation",
    description: "Validate a plan, apply report, validationTarget, or run artifact.",
    inputSchema: {
      type: "object",
      properties: { runIdOrPlan: stringProperty, includeBaselineDetails: booleanProperty },
      required: ["runIdOrPlan"],
    },
  },
  {
    name: "repair_generated",
    description: "Refresh generated Akan files before direct generated-file edits.",
    inputSchema: { type: "object", properties: { app: stringProperty }, required: ["app"] },
  },
  {
    name: "repair_imports",
    description: "Run the import repair path before manual import edits.",
    inputSchema: { type: "object", properties: { target: stringProperty }, required: ["target"] },
  },
  {
    name: "repair_module_shape",
    description: "Report module-shape repair actions before direct module file fixes.",
    inputSchema: {
      type: "object",
      properties: { app: stringProperty, module: stringProperty },
      required: ["app", "module"],
    },
  },
];

export const listAkanMcpTools = (mode: "readonly" | "plan" | "apply" = "readonly") => {
  if (mode === "readonly") return readonlyMcpTools;
  if (mode === "plan") return [...readonlyMcpTools, ...planMcpTools];
  return [...readonlyMcpTools, ...planMcpTools, ...applyMcpTools];
};

export const createAkanValidationContract = (listTools = listAkanMcpTools) => ({
  schemaVersion: 1,
  reports: ["WorkflowPlan", "WorkflowApplyReport", "WorkflowValidationRunReport", "RepairReport"],
  modes: {
    readonly: listTools("readonly").map((tool) => tool.name),
    plan: listTools("plan").map((tool) => tool.name),
    apply: listTools("apply").map((tool) => tool.name),
  },
  validationCommands: [
    "akan workflow validate <run-id-or-plan> --format json",
    "akan workflow report <run-id> --format json",
    "akan doctor --strict --format json",
  ],
  validationFailureScopes: ["workspace-config", "environment", "source-change", "unknown"],
  artifactChainFields: ["planPath", "applyReportPath", "repairReportPath", "runId", "validationTarget", "next"],
  diagnosticScopes: ["baseline", "workflow", "unknown"],
  validationStatuses: {
    sourceStatus: ["passed", "failed", "unknown"],
    workspaceStatus: ["passed", "failed", "unknown"],
    validationCommandsStatus: ["passed", "failed", "unknown"],
    baselineStatus: ["passed", "failed", "unknown"],
    overallStatus: [
      "passed",
      "failed",
      "passed-with-baseline-blockers",
      "blocked-by-workspace-config",
      "blocked-by-environment",
    ],
    baselineSummary:
      "Default MCP validation output summarizes baseline diagnostics; pass includeBaselineDetails=true for full baselineDiagnostics.",
    knownBlockers: "Repeated workspace-config/environment failures are summarized before command output.",
  },
  moduleContextInputs: {
    module: "required",
    app: "required",
  },
  generatedFreshnessStatuses: ["fresh", "stale", "missing", "unknown"],
  toolingRolloutGate,
  directEditFallbackPolicy: applyFirstPolicy,
  applyReportFields: [
    "summary",
    "appliedCommands",
    "recommendedValidationCommands",
    "commands",
    "recommendations",
    "validationTarget",
  ],
  repairCommands: [
    "akan repair generated --app <app-or-lib> --format json",
    "akan repair format --target <app-or-lib-or-pkg> --format json",
    "akan repair imports --target <app-or-lib-or-pkg> --format json",
    "akan repair dictionary --app <app-or-lib> --module <module> --format json",
    "akan repair module-shape --app <app-or-lib> --module <module> --format json",
  ],
});

export const inspectAkanContext = async (
  workspace: Workspace,
  args: Record<string, unknown>,
): Promise<InspectAkanContextResult> => {
  const props = inspectAkanContextPropsArg(args);
  const diagnostics: WorkflowDiagnostic[] = [];
  if (props.draft.type !== props.request.type) {
    diagnostics.push(
      inspectDiagnostic(
        "warning",
        "inspect-draft-request-mismatch",
        `Draft chose ${props.draft.type}, but request uses ${props.request.type}.`,
      ),
    );
  }

  const baseResult = (
    type: InspectAkanContextRequest["type"],
    evidence: AkanContextEvidence[],
    next: AkanContextNext,
    data?: Record<string, unknown>,
  ): InspectAkanContextResult => ({
    schemaVersion: 1,
    type,
    question: props.question,
    diagnostics,
    evidence,
    next,
    ...(data ? { data } : {}),
  });

  if (props.request.type === "escape") {
    return baseResult(
      "escape",
      [{ kind: "escape", summary: props.request.reason }],
      {
        action: "escape",
        reason: props.request.reason,
        ...(props.request.nextStep ? { args: { nextStep: props.request.nextStep } } : {}),
      },
      { reason: props.request.reason, nextStep: props.request.nextStep ?? null },
    );
  }

  if (props.request.type === "workflowDiagnostics") {
    const doctor = await AkanContextAnalyzer.doctor(workspace, {
      strict: true,
      runIdOrPlan: workspacePath(workspace, props.request.runIdOrPlan),
    });
    const baselineSummary = createWorkflowBaselineSummary(
      (doctor.baselineDiagnostics ?? []).map(
        (diagnostic): WorkflowDiagnostic => ({
          severity: diagnostic.severity,
          code: diagnostic.code,
          message: diagnostic.message,
          scope: diagnostic.scope,
          context: diagnostic.context,
        }),
      ),
      { detailsIncluded: false },
    );
    diagnostics.push(
      ...(doctor.workflowDiagnostics ?? doctor.diagnostics).map(
        (diagnostic): WorkflowDiagnostic => ({
          severity: diagnostic.severity,
          code: diagnostic.code,
          message: diagnostic.message,
          scope: diagnostic.scope,
          context: {
            ...diagnostic.context,
            ...(diagnostic.path ? { paths: [diagnostic.path] } : {}),
          },
        }),
      ),
    );
    return baseResult(
      "workflowDiagnostics",
      [
        {
          kind: "workflow",
          target: props.request.runIdOrPlan,
          summary: `Workflow diagnostics status is ${doctor.status}.`,
        },
      ],
      {
        action: doctor.status === "passed" ? "answer" : "validate",
        reason:
          doctor.status === "passed"
            ? "No strict workspace diagnostics were found for the workflow context."
            : "Review diagnostics before applying or manually editing source files.",
      },
      {
        status: doctor.status,
        baselineSummary,
        baselineDiagnostics: 0,
        workflowDiagnostics: doctor.workflowDiagnostics?.length ?? 0,
      },
    );
  }

  const context = await AkanContextAnalyzer.analyze(workspace, {
    app:
      props.request.type === "moduleContext" || props.request.type === "fieldInsertionContext"
        ? props.request.app
        : null,
    module:
      props.request.type === "moduleContext" || props.request.type === "fieldInsertionContext"
        ? props.request.module
        : null,
    includeAbstractContent: false,
  });

  if (props.request.type === "workspaceOverview") {
    return baseResult(
      "workspaceOverview",
      [
        {
          kind: "workspace",
          summary: `${context.repoName} has ${context.apps.length} app(s), ${context.libs.length} lib(s), and ${context.pkgs.length} package(s).`,
        },
      ],
      {
        action: "inspect",
        reason: "Choose moduleContext or fieldInsertionContext for module-scoped evidence before planning a workflow.",
        tool: "inspect_akan_context",
      },
      {
        repoName: context.repoName,
        apps: context.apps.map((app) => ({ name: app.name, path: app.path, modules: app.modules.length })),
        libs: context.libs.map((lib) => ({ name: lib.name, path: lib.path, modules: lib.modules.length })),
        pkgs: context.pkgs.map((pkg) => ({ name: pkg.name, path: pkg.path, version: pkg.version ?? null })),
        generatedFiles: context.generatedFiles,
        validationCommands: context.validationCommands,
      },
    );
  }

  const modules = AkanContextAnalyzer.findModules(context, props.request.module, {
    app: props.request.app ?? null,
  });
  if (modules.length === 0) {
    diagnostics.push(
      inspectDiagnostic(
        "error",
        "inspect-module-not-found",
        `No module matched ${props.request.app ? `${props.request.app}:` : ""}${props.request.module}.`,
      ),
    );
    return baseResult(
      props.request.type,
      [],
      {
        action: "escape",
        reason:
          "The requested module was not found in the workspace index; inspect workspace files or clarify the target.",
      },
      { candidates: [] },
    );
  }
  if (!props.request.app && modules.length > 1) {
    diagnostics.push(
      inspectDiagnostic(
        "error",
        "inspect-module-ambiguous",
        `Multiple modules match "${props.request.module}". Re-run with app to disambiguate.`,
      ),
    );
    return baseResult(
      props.request.type,
      modules.map(moduleEvidence),
      {
        action: "clarify",
        reason: "Multiple modules have the same name; choose an app before planning a workflow.",
      },
      { candidates: modules.map(moduleCandidate) },
    );
  }

  const module = modules[0];
  if (props.request.type === "moduleContext") {
    return baseResult(
      "moduleContext",
      [moduleEvidence(module)],
      {
        action: "inspect",
        reason: "Use fieldInsertionContext when preparing add-field or escape when source body details are required.",
        tool: "inspect_akan_context",
      },
      { module: moduleCandidate(module) },
    );
  }

  if (module.kind !== "domain") {
    diagnostics.push(
      inspectDiagnostic(
        "error",
        "field-insertion-unsupported-module-kind",
        `fieldInsertionContext currently targets domain modules; ${module.sysName}:${module.name} is ${module.kind}.`,
      ),
    );
  }
  const moduleIndex = await buildAkanModuleContextIndex(workspace, module, { field: props.request.field });
  diagnostics.push(...moduleIndex.diagnostics);
  return baseResult(
    "fieldInsertionContext",
    [
      moduleEvidence(module),
      {
        kind: "field-insertion",
        target: `${module.sysName}:${module.name}.${props.request.field}`,
        path: module.path,
        summary:
          "M2 returns source-body-free AST index evidence for constant fields, dictionary model labels, and light projection fields.",
      },
    ],
    module.kind === "domain"
      ? {
          action: "plan_workflow",
          reason: "The module target is unambiguous; create an add-field workflow plan before source edits.",
          tool: "plan_workflow",
          args: {
            workflow: "add-field",
            inputs: {
              app: module.sysName,
              module: module.name,
              field: props.request.field,
              type: props.request.fieldType,
            },
          },
        }
      : {
          action: "escape",
          reason: "This module kind is not a supported add-field target in the P1 context contract.",
        },
    {
      target: {
        app: module.sysName,
        module: module.name,
        field: props.request.field,
        fieldType: props.request.fieldType,
      },
      files: moduleIndex.files,
      moduleIndex,
    },
  );
};
