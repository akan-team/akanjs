import { capitalize } from "akanjs/common";
import ts from "typescript";
import type { AkanModuleContext } from "../akanContext";
import type { Sys, Workspace } from "../commandDecorators";
import { AppExecutor, LibExecutor } from "../executors";
import { createWorkflowApplyReport, workflowCommandsForPlan } from "./artifacts";
import { buildAkanModuleContextIndex } from "./moduleIndex";
import {
  insertionIndexForFieldOrder,
  inspectConstantStructure,
  inspectDictionaryStructure,
  moduleComponentName,
  moduleSourcePaths,
  normalizeFieldType,
} from "./source";
import type {
  PrimitiveChangedFile,
  PrimitiveGeneratedFile,
  PrimitiveNextAction,
  PrimitiveWriteReport,
  WorkflowApplyCommand,
  WorkflowDiagnostic,
  WorkflowInputValue,
  WorkflowPlan,
  WorkflowPostApplyCheck,
  WorkflowPrimitiveOperations,
  WorkflowRecommendation,
  WorkflowStep,
  WorkflowStepRegistry,
  WorkflowStepResult,
} from "./types";
import { addFieldUiPolicyForType } from "./uiPolicy";

export const workflowStepKey = (workflow: string, stepId: string) => `${workflow}:${stepId}`;

export const primitiveReportToWorkflowStepResult = (report: PrimitiveWriteReport): WorkflowStepResult => ({
  changedFiles: report.changedFiles,
  generatedFiles: report.generatedFiles,
  commands: report.validationCommands,
  diagnostics: report.diagnostics,
  recommendations: [],
  nextActions: report.nextActions,
});

const workflowStringInput = (value: WorkflowInputValue | undefined) => (typeof value === "string" ? value : null);
const workflowStringListInput = (value: WorkflowInputValue | undefined) =>
  Array.isArray(value) ? value.join(",") : null;
const workflowStringArrayInput = (value: WorkflowInputValue | undefined) => (Array.isArray(value) ? value : null);
const workflowBooleanInput = (value: WorkflowInputValue | undefined) => (typeof value === "boolean" ? value : null);

const postApplyDiagnostic = (
  code: string,
  message: string,
  target: string,
  severity: WorkflowDiagnostic["severity"] = "error",
): WorkflowDiagnostic => ({
  severity,
  code,
  message,
  failureScope: "source-change",
  context: { target },
});

const sourceKindForPath = (filePath: string) => {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".ts")) return ts.ScriptKind.TS;
  return null;
};

const checkPathCasing = async (workspace: Workspace, filePath: string) => {
  const segments = filePath.split("/").filter(Boolean);
  let current = ".";
  for (const segment of segments) {
    const entries = await workspace.readdir(current);
    if (entries.includes(segment)) {
      current = current === "." ? segment : `${current}/${segment}`;
      continue;
    }
    const caseInsensitiveMatch = entries.find((entry) => entry.toLowerCase() === segment.toLowerCase());
    return caseInsensitiveMatch
      ? {
          code: "workflow-path-casing-mismatch",
          message: `Reported path segment "${segment}" does not match actual casing "${caseInsensitiveMatch}" in ${filePath}.`,
        }
      : {
          code: "workflow-path-missing",
          message: `Reported path does not exist: ${filePath}.`,
        };
  }
  return null;
};

const checkTypeScriptSyntax = async (workspace: Workspace, filePath: string) => {
  const scriptKind = sourceKindForPath(filePath);
  if (!scriptKind) return null;
  const content = await workspace.readFile(filePath);
  const source = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, scriptKind);
  const diagnostic = ((source as ts.SourceFile & { parseDiagnostics?: readonly ts.DiagnosticWithLocation[] })
    .parseDiagnostics ?? [])[0];
  if (!diagnostic) return null;
  const position = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
  const location = position ? `:${position.line + 1}:${position.character + 1}` : "";
  return {
    code: "workflow-post-apply-syntax-error",
    message: `Generated source has a TypeScript syntax error at ${filePath}${location}: ${ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      " ",
    )}`,
  };
};

const checkChangedFile = async (workspace: Workspace, file: PrimitiveChangedFile): Promise<WorkflowStepResult> => {
  if (file.action === "remove") return { postApplyChecks: [] };
  const issue = (await checkPathCasing(workspace, file.path)) ?? (await checkTypeScriptSyntax(workspace, file.path));
  if (issue) {
    return {
      diagnostics: [postApplyDiagnostic(issue.code, issue.message, file.path)],
      postApplyChecks: [{ ...issue, target: file.path, status: "failed" }],
    };
  }
  return {
    postApplyChecks: [
      {
        code: "workflow-post-apply-file-valid",
        target: file.path,
        status: "passed",
        message: "Changed file exists with exact casing and parses as source when applicable.",
      },
    ],
  };
};

const checkRecommendationPath = async (
  workspace: Workspace,
  recommendation: WorkflowRecommendation,
): Promise<WorkflowDiagnostic | null> => {
  if (!recommendation.target || recommendation.target.includes("*") || recommendation.target.startsWith("<"))
    return null;
  const pathIssue = await checkPathCasing(workspace, recommendation.target);
  if (!pathIssue) return null;
  return {
    severity: "warning",
    code: "workflow-recommendation-path-unverified",
    message: `${pathIssue.message} Recommendation "${recommendation.code}" should not be treated as an exact file target until the path is corrected.`,
    failureScope: "source-change",
    context: { target: recommendation.target },
  };
};

const sourceChangeError = (diagnostics: readonly WorkflowDiagnostic[]) =>
  diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === "error" &&
      (diagnostic.failureScope === "source-change" ||
        !diagnostic.failureScope ||
        diagnostic.failureScope === "unknown"),
  );

const fieldCount = (fields: readonly string[], fieldName: string) =>
  fields.filter((field) => field === fieldName).length;

const fieldOrderValid = (fields: readonly string[], fieldName: string) => {
  const actualIndex = fields.indexOf(fieldName);
  if (actualIndex < 0 || fields.lastIndexOf(fieldName) !== actualIndex) return false;
  const fieldsWithoutRequested = fields.filter((_, index) => index !== actualIndex);
  return insertionIndexForFieldOrder(fieldsWithoutRequested, fieldName) === actualIndex;
};

const workflowModuleContext = async (workspace: Workspace, plan: WorkflowPlan): Promise<AkanModuleContext | null> => {
  const app = workflowStringInput(plan.inputs.app);
  const moduleName = workflowStringInput(plan.inputs.module);
  if (!app || !moduleName) return null;
  const [apps, libs] = await workspace.getSyss();
  const sysType = apps.includes(app) ? "app" : libs.includes(app) ? "lib" : null;
  if (!sysType) return null;
  const modulePath = `${sysType}s/${app}/lib/${moduleName}`;
  const files = await workspace.readdir(modulePath);
  const abstractPath = `${modulePath}/${moduleName}.abstract.md`;
  return {
    kind: "domain",
    name: moduleName,
    folderName: moduleName,
    sysName: app,
    sysType,
    path: modulePath,
    abstract: {
      path: abstractPath,
      exists: files.includes(`${moduleName}.abstract.md`),
      headings: [],
    },
    files,
  };
};

const checkAddFieldStructure = async (workspace: Workspace, plan: WorkflowPlan): Promise<WorkflowStepResult> => {
  if (plan.workflow !== "add-field" && plan.workflow !== "add-enum-field") return {};
  const app = workflowStringInput(plan.inputs.app);
  const moduleName = workflowStringInput(plan.inputs.module);
  const fieldName = workflowStringInput(plan.inputs.field);
  const typeName = workflowStringInput(plan.inputs.type);
  if (!app || !moduleName || !fieldName || !typeName) return {};

  const moduleContext = await workflowModuleContext(workspace, plan);
  if (!moduleContext) return {};

  const paths = moduleSourcePaths(moduleName);
  const constantPath = `${moduleContext.path}/${paths.constant.replace(`lib/${moduleName}/`, "")}`;
  const dictionaryPath = `${moduleContext.path}/${paths.dictionary.replace(`lib/${moduleName}/`, "")}`;
  const moduleClassName = moduleComponentName(moduleName);
  const inputClassName = `${moduleClassName}Input`;
  const index = await buildAkanModuleContextIndex(workspace, moduleContext, { field: fieldName });
  const diagnostics: WorkflowDiagnostic[] = [];
  const postApplyChecks: WorkflowPostApplyCheck[] = [];

  const constantContent = await workspace.readFile(constantPath);
  const constantStructure = inspectConstantStructure(constantContent, inputClassName, moduleClassName);
  const constantNames = constantStructure.fields.map((field) => field.name);
  const requestedConstantFields = constantStructure.fields.filter((field) => field.name === fieldName);
  const normalizedType = typeName.toLowerCase() === "enum" ? typeName : normalizeFieldType(typeName);
  const constantFailures = [
    !constantStructure.parseValid ? "constant file does not parse" : null,
    !constantStructure.inputObjectFound ? `${inputClassName} via builder object was not found` : null,
    requestedConstantFields.length !== 1
      ? `field "${fieldName}" appears ${requestedConstantFields.length} time(s) in ${inputClassName}`
      : null,
    constantStructure.builderName &&
    requestedConstantFields[0]?.expressionBuilder &&
    requestedConstantFields[0].expressionBuilder !== constantStructure.builderName
      ? `field "${fieldName}" uses builder "${requestedConstantFields[0].expressionBuilder}" instead of "${constantStructure.builderName}"`
      : null,
    !constantStructure.builderName ? `${inputClassName} via builder parameter was not found` : null,
    (normalizedType === "Int" || normalizedType === "Float") && !constantStructure.baseImports.includes(normalizedType)
      ? `missing ${normalizedType} import from "akanjs/base"`
      : null,
    workflowBooleanInput(plan.inputs.includeInLight) === true &&
    fieldCount(constantStructure.lightProjectionFields, fieldName) !== 1
      ? `field "${fieldName}" is not present exactly once in Light${moduleClassName}`
      : null,
    ...index.diagnostics
      .filter((diagnostic) => diagnostic.severity === "error" && diagnostic.context?.paths?.includes(constantPath))
      .map((diagnostic) => diagnostic.message),
  ].filter((failure): failure is string => failure !== null);
  const constantValid = constantFailures.length === 0;
  postApplyChecks.push({
    code: constantValid ? "workflow-post-apply-constant-shape-valid" : "workflow-post-apply-structure-invalid",
    target: constantPath,
    status: constantValid ? "passed" : "failed",
    message: constantValid
      ? `${inputClassName} keeps via structure, builder usage, imports, and requested field presence.`
      : constantFailures.join(" "),
  });
  if (!constantValid) {
    diagnostics.push(
      postApplyDiagnostic("workflow-post-apply-structure-invalid", constantFailures.join(" "), constantPath),
    );
  }

  const dictionaryContent = await workspace.readFile(dictionaryPath);
  const dictionaryStructure = inspectDictionaryStructure(dictionaryContent, moduleClassName);
  const dictionaryFailures = [
    !dictionaryStructure.parseValid ? "dictionary file does not parse" : null,
    !dictionaryStructure.modelObjectFound ? `.model<${moduleClassName}> object was not found` : null,
    dictionaryStructure.modelObjectFound && !dictionaryStructure.chainOrderValid
      ? `.model(), .slice(), .enum(), .error(), and .translate() chain order is broken: ${dictionaryStructure.chainMethods.join(
          " -> ",
        )}`
      : null,
    fieldCount(dictionaryStructure.fields, fieldName) !== 1
      ? `field "${fieldName}" appears ${fieldCount(dictionaryStructure.fields, fieldName)} time(s) in .model<${moduleClassName}>`
      : null,
    ...index.diagnostics
      .filter((diagnostic) => diagnostic.severity === "error" && diagnostic.context?.paths?.includes(dictionaryPath))
      .map((diagnostic) => diagnostic.message),
  ].filter((failure): failure is string => failure !== null);
  const dictionaryValid = dictionaryFailures.length === 0;
  postApplyChecks.push({
    code: dictionaryValid ? "workflow-post-apply-dictionary-shape-valid" : "workflow-post-apply-structure-invalid",
    target: dictionaryPath,
    status: dictionaryValid ? "passed" : "failed",
    message: dictionaryValid
      ? `.model<${moduleClassName}> keeps the requested field inside the model object and preserves dictionary chain order.`
      : dictionaryFailures.join(" "),
  });
  if (!dictionaryValid) {
    diagnostics.push(
      postApplyDiagnostic("workflow-post-apply-structure-invalid", dictionaryFailures.join(" "), dictionaryPath),
    );
  }

  const constantOrderValid = fieldOrderValid(constantNames, fieldName);
  const dictionaryOrderValid = fieldOrderValid(dictionaryStructure.fields, fieldName);
  const orderValid = constantOrderValid && dictionaryOrderValid;
  postApplyChecks.push({
    code: "workflow-post-apply-field-order-valid",
    target: `${constantPath}, ${dictionaryPath}`,
    status: orderValid ? "passed" : "failed",
    message: orderValid
      ? `Field "${fieldName}" follows the shared priority ordering policy.`
      : `Field "${fieldName}" is present but does not match the shared priority ordering policy.`,
  });
  if (!orderValid) {
    diagnostics.push(
      postApplyDiagnostic(
        "workflow-post-apply-field-order-mismatch",
        `Field "${fieldName}" is present but does not match the shared priority ordering policy.`,
        `${constantPath}, ${dictionaryPath}`,
        "warning",
      ),
    );
  }

  return { diagnostics, postApplyChecks };
};

export const resolveWorkflowSys = async (workspace: Workspace, target: string | null): Promise<Sys | null> => {
  if (!target) return null;
  const [apps, libs] = await workspace.getSyss();
  if (apps.includes(target)) return AppExecutor.from(workspace, target);
  if (libs.includes(target)) return LibExecutor.from(workspace, target);
  return null;
};

const targetMissing = (input = "app"): WorkflowDiagnostic => ({
  severity: "error",
  code: "workflow-target-missing",
  input,
  message: "Workflow target app or library was not found.",
});

const inputMissing = (input: string): WorkflowDiagnostic => ({
  severity: "error",
  code: "workflow-input-missing",
  input,
  message: `Workflow input "${input}" is required for apply.`,
});

const unsupportedInput = (input: string, message: string): WorkflowDiagnostic => ({
  severity: "error",
  code: "workflow-input-unsupported",
  input,
  message,
});

const surfaceReview = (
  plan: WorkflowPlan,
  { code, target, action, message, reason }: Record<"code" | "target" | "action" | "message" | "reason", string>,
): WorkflowStepResult => ({
  recommendations: [{ code, kind: "manual-action", target, action, confidence: "medium", message }],
  nextActions: [{ command: `akan workflow explain ${plan.workflow}`, reason }],
});

const addFieldUiSurfaceInspection = (plan: WorkflowPlan): WorkflowStepResult => {
  const app = workflowStringInput(plan.inputs.app);
  const module = workflowStringInput(plan.inputs.module) ?? "<module>";
  const field = workflowStringInput(plan.inputs.field) ?? "<field>";
  const typeName = workflowStringInput(plan.inputs.type);
  const policy = addFieldUiPolicyForType(typeName ?? "String");
  const surfaces = workflowStringArrayInput(plan.inputs.surfaces);
  const templateRequested = surfaces?.includes("template") ?? false;
  const moduleClassName = moduleComponentName(module);
  return surfaceReview(plan, {
    code: "add-field-ui-surface-review",
    target: `${app ? `apps/${app}` : "*"}/${moduleSourcePaths(module).template}`,
    action: templateRequested
      ? `Template was requested for ${field}. If no Template file changed, users will not see the field in the form yet because the file was missing, the generated ${module}Form/Layout.Template pattern was not found, or ${policy.component} needs option binding. Add it inside Layout.Template near existing Field components.`
      : `Template was not selected, so users will not see ${field} in the form from this apply. If list/card display is needed, include ${field} in Light${moduleClassName} projection data and place it in the local Unit/View card layout.`,
    message: `Review user-visible UI for ${module}.${field}; recommended component is ${policy.component}.`,
    reason: "Review UI surface guidance before manually editing ambiguous UI files.",
  });
};

const addMutationActionSurfaceInspection = (plan: WorkflowPlan): WorkflowStepResult => {
  const module = workflowStringInput(plan.inputs.module) ?? "<module>";
  const mutation = workflowStringInput(plan.inputs.mutation) ?? "<mutation>";
  const moduleClassName = moduleComponentName(module);
  return surfaceReview(plan, {
    code: "add-mutation-action-surface-review",
    target: `*/${moduleSourcePaths(module).util}`,
    action: `Fill the ${moduleClassName} chain method (validate, mutate, return this) and replace its transition comment. After sync, call st.do.${mutation}(id) from the control in ${moduleClassName}.Util.tsx; a second write that must land with it is another with/after entry, never a second fetch in the store action.`,
    message: `Workflow apply does not write UI code for ${module}.${mutation}; review which screen calls it.`,
    reason: "Review action surface guidance before manually editing UI files.",
  });
};

const addSliceViewSurfaceInspection = (plan: WorkflowPlan): WorkflowStepResult => {
  const module = workflowStringInput(plan.inputs.module) ?? "<module>";
  const slice = workflowStringInput(plan.inputs.slice) ?? "<slice>";
  const moduleClassName = moduleComponentName(module);
  return surfaceReview(plan, {
    code: "add-slice-view-surface-review",
    target: `*/${moduleSourcePaths(module).zone}`,
    action: `Fill in the service query stub and add the dictionary .slice() entry. After sync, load fetch.init${moduleClassName}${capitalize(slice)}() in the page and pass the result to a ${moduleClassName}.Zone as an init prop.`,
    message: `Workflow apply does not write page or Zone code for ${module}.${slice}; review where the list should render.`,
    reason: "Review view surface guidance before manually editing Zone or page files.",
  });
};

export const createWorkflowStepRegistry = ({
  workspace,
  createModule,
  createScalar,
  createUi,
  addField,
  addEnumField,
  addMutation,
  addSlice,
  renameKey,
  createInteraction,
}: WorkflowPrimitiveOperations): WorkflowStepRegistry => {
  const inspect = async () => undefined;
  const commandOnly = async () => undefined;

  return {
    inspectSystem: inspect,
    inspectModule: inspect,
    syncTarget: commandOnly,
    lintTarget: commandOnly,
    [workflowStepKey("create-module", "create-module")]: async (_step, plan) => {
      const app = workflowStringInput(plan.inputs.app);
      const module = workflowStringInput(plan.inputs.module);
      const sys = await resolveWorkflowSys(workspace, app);
      if (!sys || !module) return { diagnostics: [!sys ? targetMissing() : inputMissing("module")] };
      return primitiveReportToWorkflowStepResult(await createModule(sys, module));
    },
    [workflowStepKey("create-scalar", "create-scalar")]: async (_step, plan) => {
      const app = workflowStringInput(plan.inputs.app);
      const scalar = workflowStringInput(plan.inputs.scalar);
      const sys = await resolveWorkflowSys(workspace, app);
      if (!sys || !scalar) return { diagnostics: [!sys ? targetMissing() : inputMissing("scalar")] };
      return primitiveReportToWorkflowStepResult(await createScalar(sys, scalar));
    },
    [workflowStepKey("create-ui", "create-ui")]: async (_step, plan) => {
      const surface = workflowStringInput(plan.inputs.surface);
      if (surface !== "view" && surface !== "unit" && surface !== "template") {
        return {
          diagnostics: [
            unsupportedInput("surface", "Workflow apply currently supports create-ui surfaces: view, unit, template."),
          ],
        };
      }
      return primitiveReportToWorkflowStepResult(
        await createUi({
          app: workflowStringInput(plan.inputs.app),
          module: workflowStringInput(plan.inputs.module),
          surface,
        }),
      );
    },
    [workflowStepKey("add-field", "update-constant")]: async (_step, plan) => {
      if (workflowStringInput(plan.inputs.type)?.toLowerCase() === "enum") {
        return primitiveReportToWorkflowStepResult(
          await addEnumField({
            app: workflowStringInput(plan.inputs.app),
            module: workflowStringInput(plan.inputs.module),
            field: workflowStringInput(plan.inputs.field),
            values: workflowStringListInput(plan.inputs.values),
            defaultValue: workflowStringInput(plan.inputs.default),
            surfaces: workflowStringArrayInput(plan.inputs.surfaces),
            includeInLight: workflowBooleanInput(plan.inputs.includeInLight),
          }),
        );
      }
      return primitiveReportToWorkflowStepResult(
        await addField({
          app: workflowStringInput(plan.inputs.app),
          module: workflowStringInput(plan.inputs.module),
          field: workflowStringInput(plan.inputs.field),
          type: workflowStringInput(plan.inputs.type),
          defaultValue: workflowStringInput(plan.inputs.default),
          surfaces: workflowStringArrayInput(plan.inputs.surfaces),
          includeInLight: workflowBooleanInput(plan.inputs.includeInLight),
        }),
      );
    },
    [workflowStepKey("add-field", "update-dictionary")]: inspect,
    [workflowStepKey("add-field", "update-ui-surfaces")]: async (_step, plan) => addFieldUiSurfaceInspection(plan),
    [workflowStepKey("add-enum-field", "update-constant")]: async (_step, plan) =>
      primitiveReportToWorkflowStepResult(
        await addEnumField({
          app: workflowStringInput(plan.inputs.app),
          module: workflowStringInput(plan.inputs.module),
          field: workflowStringInput(plan.inputs.field),
          values: workflowStringListInput(plan.inputs.values),
          defaultValue: workflowStringInput(plan.inputs.default),
        }),
      ),
    [workflowStepKey("add-enum-field", "update-dictionary")]: inspect,
    [workflowStepKey("add-enum-field", "update-option")]: inspect,
    [workflowStepKey("add-mutation", "update-document")]: async (_step, plan) =>
      primitiveReportToWorkflowStepResult(
        await addMutation({
          app: workflowStringInput(plan.inputs.app),
          module: workflowStringInput(plan.inputs.module),
          mutation: workflowStringInput(plan.inputs.mutation),
          guards: workflowStringArrayInput(plan.inputs.guard),
          withCalls: workflowStringArrayInput(plan.inputs.with),
          afterCalls: workflowStringArrayInput(plan.inputs.after),
        }),
      ),
    [workflowStepKey("add-mutation", "update-service")]: inspect,
    [workflowStepKey("add-mutation", "update-signal")]: inspect,
    [workflowStepKey("add-mutation", "update-store")]: inspect,
    [workflowStepKey("add-mutation", "update-dictionary")]: inspect,
    [workflowStepKey("add-mutation", "add-signal-test")]: inspect,
    [workflowStepKey("add-mutation", "connect-action-ui")]: async (_step, plan) =>
      addMutationActionSurfaceInspection(plan),
    [workflowStepKey("create-interaction", "create-interaction")]: async (_step, plan) =>
      primitiveReportToWorkflowStepResult(
        await createInteraction({
          app: workflowStringInput(plan.inputs.app),
          interaction: workflowStringInput(plan.inputs.interaction),
        }),
      ),
    [workflowStepKey("add-slice", "update-service-query")]: async (_step, plan) =>
      primitiveReportToWorkflowStepResult(
        await addSlice({
          app: workflowStringInput(plan.inputs.app),
          module: workflowStringInput(plan.inputs.module),
          slice: workflowStringInput(plan.inputs.slice),
        }),
      ),
    [workflowStepKey("add-slice", "update-signal-slice")]: inspect,
    [workflowStepKey("add-slice", "connect-view-surfaces")]: async (_step, plan) => addSliceViewSurfaceInspection(plan),
    [workflowStepKey("rename-key", "rename-key")]: async (_step, plan) =>
      primitiveReportToWorkflowStepResult(
        await renameKey({
          app: workflowStringInput(plan.inputs.app),
          module: workflowStringInput(plan.inputs.module),
          slice: workflowStringInput(plan.inputs.slice),
          query: workflowStringInput(plan.inputs.query),
          to: workflowStringInput(plan.inputs.to),
        }),
      ),
  };
};

export const createWorkflowStepCommandResult = (
  step: WorkflowStep,
  command: string,
  reason: string,
): WorkflowStepResult => ({
  commands: [{ command, reason, stepId: step.id }],
  nextActions: [{ command, reason }],
});

export class WorkflowExecutor {
  constructor(
    private readonly registry: WorkflowStepRegistry,
    private readonly workspace?: Workspace,
  ) {}

  async apply(plan: WorkflowPlan) {
    const changedFiles: PrimitiveChangedFile[] = [];
    const generatedFiles: PrimitiveGeneratedFile[] = [];
    const recommendedValidationCommands: WorkflowApplyCommand[] = [];
    const diagnostics: WorkflowDiagnostic[] = [...plan.diagnostics];
    const postApplyChecks: WorkflowPostApplyCheck[] = [];
    const recommendations = [...plan.recommendations];
    const nextActions: PrimitiveNextAction[] = [];
    const report = () =>
      createWorkflowApplyReport({
        workflow: plan.workflow,
        mode: "apply",
        changedFiles,
        generatedFiles,
        recommendedValidationCommands,
        diagnostics,
        postApplyChecks,
        recommendations,
        nextActions,
        plan,
      });

    if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) return report();

    recommendedValidationCommands.push(...workflowCommandsForPlan(plan));
    nextActions.push(...workflowCommandsForPlan(plan));

    for (const step of plan.steps) {
      const runner =
        this.registry[workflowStepKey(plan.workflow, step.id)] ?? this.registry[step.tool] ?? this.registry[step.id];
      if (!runner) {
        diagnostics.push({
          severity: "error",
          code: "workflow-step-unsupported",
          message: `Workflow ${plan.workflow} step "${step.id}" is not supported by workflow apply yet.`,
        });
        nextActions.push({
          command: `akan workflow explain ${plan.workflow}`,
          reason: "Review the unsupported workflow step before retrying apply.",
        });
        break;
      }

      const result = await runner(step, plan);
      if (!result) continue;
      changedFiles.push(...(result.changedFiles ?? []));
      generatedFiles.push(...(result.generatedFiles ?? []));
      recommendedValidationCommands.push(...(result.commands ?? []));
      diagnostics.push(...(result.diagnostics ?? []));
      recommendations.push(...(result.recommendations ?? []));
      nextActions.push(...(result.nextActions ?? []));
      if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) break;
    }

    if (this.workspace && !diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      for (const file of changedFiles) {
        const result = await checkChangedFile(this.workspace, file);
        postApplyChecks.push(...(result.postApplyChecks ?? []));
        diagnostics.push(...(result.diagnostics ?? []));
      }
      if (!sourceChangeError(diagnostics)) {
        const result = await checkAddFieldStructure(this.workspace, plan);
        postApplyChecks.push(...(result.postApplyChecks ?? []));
        diagnostics.push(...(result.diagnostics ?? []));
      }
      const recommendationDiagnostics = await Promise.all(
        recommendations.map((recommendation) => checkRecommendationPath(this.workspace as Workspace, recommendation)),
      );
      diagnostics.push(
        ...recommendationDiagnostics.filter((diagnostic): diagnostic is WorkflowDiagnostic => !!diagnostic),
      );
    }

    return report();
  }
}
