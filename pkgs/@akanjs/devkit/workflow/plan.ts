import { capitalize } from "akanjs/common";
import type { Sys, Workspace } from "../commandDecorators";
import { workflowPlanApproval } from "./artifacts";
import { resolveWorkflowSys } from "./executor";
import { InteractionScaffold } from "./interactionScaffold";
import { KeyRename } from "./keyRename";
import { MutationScaffold } from "./mutationScaffold";
import { coerceFieldDefault, getSysRoot, moduleSourcePaths } from "./source";
import type {
  WorkflowDiagnostic,
  WorkflowInputSpec,
  WorkflowInputValue,
  WorkflowPlan,
  WorkflowPlanInputs,
  WorkflowRecommendation,
  WorkflowSpec,
  WorkflowSurfaceMode,
} from "./types";
import { addFieldUiPolicyForType } from "./uiPolicy";

const surfaceModes = new Set<WorkflowSurfaceMode>(["infer", "include", "skip"]);

const sysNamePattern = /^[a-z0-9][a-zA-Z0-9_-]*$/;
const identifierPattern = /^_{0,2}[a-zA-Z][a-zA-Z0-9_-]*$/;
//? These inputs become path segments, identifiers and command arguments, so none may carry a separator or a dot.
const nameInputPatterns: Record<string, RegExp> = {
  app: sysNamePattern,
  module: identifierPattern,
  scalar: identifierPattern,
  field: identifierPattern,
  slice: identifierPattern,
  query: identifierPattern,
  to: identifierPattern,
  mutation: identifierPattern,
  interaction: identifierPattern,
};

export const isWorkflowSysName = (value: unknown): value is string =>
  typeof value === "string" && sysNamePattern.test(value);
export const isWorkflowModuleName = (value: unknown): value is string =>
  typeof value === "string" && identifierPattern.test(value);

const parseStringList = (value: unknown) => {
  if (Array.isArray(value)) {
    const values = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    return values.length === value.length ? values : null;
  }
  if (typeof value !== "string") return null;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizeInputValue = (name: string, spec: WorkflowInputSpec, value: unknown): WorkflowInputValue | null => {
  if (spec.type === "string") return typeof value === "string" && value.length > 0 ? value : null;
  if (spec.type === "string-list") {
    const values = parseStringList(value);
    return values && values.length > 0 ? values : null;
  }
  if (spec.type === "boolean") {
    if (typeof value === "boolean") return value;
    if (typeof value !== "string") return null;
    const lowered = value.trim().toLowerCase();
    if (lowered === "true") return true;
    if (lowered === "false") return false;
    return null;
  }
  if (typeof value === "string" && surfaceModes.has(value as WorkflowSurfaceMode)) return value as WorkflowSurfaceMode;
  throw new Error(`Unsupported workflow input value for ${name}`);
};

export const listWorkflowSpecs = (specs: readonly WorkflowSpec[]) =>
  [...specs].sort((a, b) => a.name.localeCompare(b.name));

export const getWorkflowSpec = (specs: readonly WorkflowSpec[], name: string) =>
  specs.find((spec) => spec.name === name) ?? null;

export const compactWorkflowInputs = (inputs: WorkflowPlanInputs) =>
  Object.fromEntries(Object.entries(inputs).filter(([, value]) => value !== null && value !== ""));

const addFieldTargetRoot = (app: string | null) => (app ? `apps/${app}` : "*");

const addFieldPaths = (inputs: Record<string, WorkflowInputValue>) => {
  const app = typeof inputs.app === "string" ? inputs.app : null;
  const module = typeof inputs.module === "string" ? inputs.module : "<module>";
  const paths = moduleSourcePaths(module);
  const root = addFieldTargetRoot(app);
  return {
    constant: `${root}/${paths.constant}`,
    dictionary: `${root}/${paths.dictionary}`,
    template: `${root}/${paths.template}`,
    unit: `${root}/${paths.unit}`,
    view: `${root}/${paths.view}`,
  };
};

const selectedAddFieldSurfaces = (inputs: Record<string, WorkflowInputValue>) =>
  Array.isArray(inputs.surfaces) ? new Set(inputs.surfaces) : null;

const addFieldDefaultCoercion = (inputs: Record<string, WorkflowInputValue>) => {
  const typeName = typeof inputs.type === "string" ? inputs.type : null;
  const defaultValue = typeof inputs.default === "string" ? inputs.default : null;
  if (!typeName || defaultValue === null) return null;
  if (typeName.toLowerCase() === "number" || typeName.toLowerCase() === "numeric") return null;
  const enumValues = Array.isArray(inputs.values) ? inputs.values : null;
  return coerceFieldDefault(typeName.toLowerCase() === "enum" ? "enum" : typeName, defaultValue, { enumValues });
};

const createAddFieldDefaultRecommendations = (inputs: Record<string, WorkflowInputValue>): WorkflowRecommendation[] => {
  const field = typeof inputs.field === "string" ? inputs.field : "<field>";
  const coercion = addFieldDefaultCoercion(inputs);
  if (!coercion?.normalized || !coercion.expression) return [];
  return [
    {
      code: "add-field-default-normalized",
      kind: "manual-action",
      confidence: "high",
      message: `Default for ${field} will be normalized to ${coercion.normalizedType} literal ${coercion.expression}.`,
      action:
        "Review the normalized default in the apply report. To leave the field without a default, omit the default input.",
    },
  ];
};

const moneyLikeFieldPattern = /(budget|price|amount|cost|rate|fee|salary|balance)/i;
const wholeNumberFieldPattern = /(count|quantity|total|number|index|rank|order|age)/i;

const createAddFieldInputRecommendations = (inputs: Record<string, WorkflowInputValue>): WorkflowRecommendation[] => {
  const field = typeof inputs.field === "string" ? inputs.field : "<field>";
  const typeName = typeof inputs.type === "string" ? inputs.type : null;
  const recommendations: WorkflowRecommendation[] = [];
  if (!typeName) return recommendations;
  if (typeName.toLowerCase() === "number" || typeName.toLowerCase() === "numeric") {
    const recommendedType = moneyLikeFieldPattern.test(field)
      ? "Float"
      : wholeNumberFieldPattern.test(field)
        ? "Int"
        : null;
    recommendations.push({
      code: "add-field-type-choice",
      kind: "input-guidance",
      confidence: recommendedType ? "high" : "medium",
      message: recommendedType
        ? `Use ${recommendedType} for ${field}; Float is recommended for money-like decimal values and Int for whole-number values.`
        : `Choose Int for whole-number ${field} values or Float for decimal ${field} values.`,
      action: recommendedType
        ? `Re-run plan_workflow with type="${recommendedType}".`
        : 'Re-run plan_workflow with type="Int" or type="Float".',
    });
  }
  if (typeName.toLowerCase() === "enum" && !Array.isArray(inputs.values)) {
    recommendations.push({
      code: "add-field-enum-values",
      kind: "input-guidance",
      confidence: "high",
      message: `Enum field ${field} needs values before apply can choose valid dictionary and default behavior.`,
      action: 'Pass values as an array or comma-separated string, for example values=["draft","done"].',
    });
  }
  if (inputs.default === undefined) {
    recommendations.push({
      code: "add-field-default-optional",
      kind: "input-guidance",
      confidence: "medium",
      message: `No default will be written for ${field} because default is omitted.`,
      action: "Keep default omitted when the field should have no default value.",
    });
  }
  return recommendations;
};

const createAddFieldRecommendations = (inputs: Record<string, WorkflowInputValue>): WorkflowRecommendation[] => {
  const app = typeof inputs.app === "string" ? inputs.app : "<app-or-lib>";
  const module = typeof inputs.module === "string" ? inputs.module : "<module>";
  const field = typeof inputs.field === "string" ? inputs.field : "<field>";
  const typeName = typeof inputs.type === "string" ? inputs.type : null;
  if (!typeName) return [];

  const policy = addFieldUiPolicyForType(typeName);
  const normalizedType = policy.normalizedType;
  const paths = addFieldPaths(inputs);
  const surfaces = selectedAddFieldSurfaces(inputs);
  const templateRequested = surfaces?.has("template") ?? false;
  const includeInLight = inputs.includeInLight === true;
  return [
    ...(normalizedType === "Int" || normalizedType === "Float"
      ? [
          {
            code: "add-field-import",
            kind: "import" as const,
            target: paths.constant,
            confidence: "high" as const,
            message: `Import ${normalizedType} from "akanjs/base" before writing field(${normalizedType}).`,
          },
        ]
      : []),
    {
      code: "add-field-placement-constant",
      kind: "placement",
      target: paths.constant,
      confidence: "high",
      message: `Insert ${field}: field(${normalizedType}) in ${capitalize(module)}Input.`,
    },
    {
      code: "add-field-placement-dictionary",
      kind: "placement",
      target: paths.dictionary,
      confidence: "high",
      message: `Add dictionary labels for ${module}.${field}.`,
    },
    {
      code: "add-field-component",
      kind: "ui-component",
      target: paths.template,
      confidence: policy.confidence,
      action: templateRequested
        ? `apply_workflow will try to add ${policy.component} to Template when the existing Template has a safe generated field-list pattern.`
        : `Recommended component is ${policy.component}. Pass surfaces=["template"] when this field should be rendered in the Template form.`,
      message: `Recommended UI component for ${field} (${normalizedType}): ${policy.component}.`,
    },
    ...(!surfaces
      ? [
          {
            code: "add-field-template-surface-choice",
            kind: "manual-action" as const,
            target: paths.template,
            action: `Choose whether to expose ${field} in Template by passing surfaces=["template"].`,
            confidence: "medium" as const,
            message: `Template exposure for ${module}.${field} is not selected yet.`,
          },
        ]
      : []),
    includeInLight
      ? {
          code: "add-field-light-projection",
          kind: "placement",
          target: paths.constant,
          confidence: "high",
          message: `Add ${field} to Light${capitalize(module)} projection fields.`,
        }
      : {
          code: "add-field-light-projection-choice",
          kind: "manual-action",
          target: paths.constant,
          action: `Pass includeInLight=true when users should see ${field} in list/card data. Without it, the field can exist on ${capitalize(
            module,
          )}Input but stay absent from Light${capitalize(module)} projections.`,
          confidence: "medium",
          message: `${module}.${field} is not selected for list/card projection data.`,
        },
    ...(surfaces && !templateRequested
      ? [
          {
            code: "add-field-ui-surface-skip",
            kind: "manual-action" as const,
            target: paths.template,
            confidence: "medium" as const,
            message: `Template form auto-edit is skipped for ${module}.${field} because surfaces does not include "template".`,
            action: `Pass surfaces=["template"] when users should enter ${field} in the Template form.`,
          },
        ]
      : []),
    {
      code: "add-field-ui-manual-review",
      kind: "manual-action",
      target: paths.template,
      action: `After apply, verify what users can see: Template form auto-edit only runs when a generated ${module}Form hook and Layout.Template field list are present. Unit/View cards are not auto-edited, so ${field} may be stored on ${capitalize(
        module,
      )} but not shown in list/card UI until you place it in the local card layout.`,
      confidence: "medium",
      message: `${app}:${module}.${field} may need UI review for user-visible Template, Unit, and View behavior.`,
    },
    ...createAddFieldDefaultRecommendations(inputs),
    ...createAddFieldInputRecommendations(inputs),
  ];
};

const createWorkflowPlanPredictedChanges = (
  spec: WorkflowSpec,
  inputs: Record<string, WorkflowInputValue>,
): WorkflowPlan["predictedChanges"] => {
  if (spec.name !== "add-field") return spec.predictedChanges;
  const paths = addFieldPaths(inputs);
  const surfaces = selectedAddFieldSurfaces(inputs);
  const includeInLight = inputs.includeInLight === true;
  return [
    {
      target: paths.constant,
      action: "modify",
      applyScope: "auto",
      reason: includeInLight ? "Field shape and Light projection are added." : "Field shape is added.",
    },
    {
      target: paths.dictionary,
      action: "modify",
      applyScope: "auto",
      reason: "Field label is added.",
    },
    ...(!surfaces || surfaces.has("template")
      ? [
          {
            target: paths.template,
            action: "modify" as const,
            applyScope: surfaces?.has("template") ? ("auto" as const) : ("manual-review" as const),
            reason: surfaces?.has("template")
              ? "Template form is selected for safe-pattern auto insertion."
              : "Form surface may include the field.",
          },
        ]
      : []),
    {
      target: `${addFieldTargetRoot(typeof inputs.app === "string" ? inputs.app : null)}/lib/cnst.ts`,
      action: "sync",
      applyScope: "generated-sync",
      reason: "Generated constants may change after sync.",
    },
    {
      target: `${addFieldTargetRoot(typeof inputs.app === "string" ? inputs.app : null)}/lib/dict.ts`,
      action: "sync",
      applyScope: "generated-sync",
      reason: "Generated dictionary barrel may change after sync.",
    },
  ];
};

const createWorkflowPlanOptionalSurfaces = (
  spec: WorkflowSpec,
  inputs: Record<string, WorkflowInputValue>,
): Record<string, WorkflowSurfaceMode> => {
  const optionalSurfaces = spec.optionalSurfaces ?? {};
  const surfaces = selectedAddFieldSurfaces(inputs);
  if (spec.name !== "add-field" || !surfaces) return optionalSurfaces;
  return Object.fromEntries(
    Object.entries(optionalSurfaces).map(([surface, mode]) => [surface, surfaces.has(surface) ? "include" : mode]),
  );
};

const createWorkflowPlanRecommendations = (
  spec: WorkflowSpec,
  inputs: Record<string, WorkflowInputValue>,
): WorkflowRecommendation[] => [
  {
    code: "workflow-apply-first",
    kind: "auto-apply",
    confidence: "high",
    action: "Call apply_workflow with the MCP planPath before editing source files directly.",
    message: `Apply the ${spec.name} plan through apply_workflow when MCP returns planPath or next.tool=apply_workflow.`,
  },
  {
    code: "workflow-validate-apply-report",
    kind: "validation",
    confidence: "high",
    action:
      "After apply_workflow, call run_validation with validationTarget when present; otherwise use applyReportPath.",
    message: "Validate the apply report artifact so diagnostics and recommendations follow the actual apply result.",
  },
  ...(spec.name === "add-field" ? createAddFieldRecommendations(inputs) : []),
];

export const createWorkflowPlan = (spec: WorkflowSpec, rawInputs: Record<string, unknown>): WorkflowPlan => {
  const inputs: Record<string, WorkflowInputValue> = {};
  const diagnostics: WorkflowDiagnostic[] = [];

  for (const [name, inputSpec] of Object.entries(spec.inputs)) {
    const rawValue = rawInputs[name];
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      if (inputSpec.required) {
        diagnostics.push({
          severity: "error",
          code: "workflow-input-missing",
          input: name,
          message: `Workflow ${spec.name} requires input "${name}".`,
        });
      }
      continue;
    }

    const value = normalizeInputValue(name, inputSpec, rawValue);
    if (value === null) {
      diagnostics.push({
        severity: "error",
        code: "workflow-input-invalid",
        input: name,
        message: `Workflow ${spec.name} input "${name}" must be ${inputSpec.type}.`,
      });
      continue;
    }
    const namePattern = nameInputPatterns[name];
    if (namePattern && typeof value === "string" && !namePattern.test(value)) {
      diagnostics.push({
        severity: "error",
        code: "workflow-input-invalid",
        input: name,
        message: `Workflow ${spec.name} input "${name}" must be a plain name without dots, slashes or spaces, not ${JSON.stringify(value)}.`,
      });
      continue;
    }
    if (inputSpec.allowedValues && typeof value === "string" && !inputSpec.allowedValues.includes(value)) {
      diagnostics.push({
        severity: "error",
        code: "workflow-input-not-allowed",
        input: name,
        message: `Workflow ${spec.name} input "${name}" must be one of: ${inputSpec.allowedValues.join(", ")}.`,
      });
      continue;
    }
    inputs[name] = value;
  }

  const fieldType = inputs.type;
  if (
    spec.name === "add-field" &&
    typeof fieldType === "string" &&
    (fieldType.toLowerCase() === "number" || fieldType.toLowerCase() === "numeric")
  ) {
    diagnostics.push({
      severity: "error",
      code: "primitive-field-type-unsupported",
      input: "type",
      message: `Field type "${fieldType}" is ambiguous in Akan. Use Int for integer fields or Float for decimal fields.`,
    });
  }
  if (spec.name === "add-field") {
    const defaultCoercion = addFieldDefaultCoercion(inputs);
    if (defaultCoercion?.diagnostic) {
      diagnostics.push({
        ...defaultCoercion.diagnostic,
        code: "workflow-default-value-invalid",
        message: `Plan input default is not valid for ${defaultCoercion.normalizedType}: ${defaultCoercion.diagnostic.message}`,
      });
    } else if (defaultCoercion?.normalized && defaultCoercion.expression) {
      diagnostics.push({
        severity: "warning",
        code: "workflow-default-value-normalized",
        input: "default",
        failureScope: "source-change",
        message: `Plan input default will be written as ${defaultCoercion.normalizedType} literal ${defaultCoercion.expression}.`,
      });
    }
  }

  return {
    schemaVersion: 1,
    workflow: spec.name,
    mode: "plan",
    inputs,
    optionalSurfaces: createWorkflowPlanOptionalSurfaces(spec, inputs),
    steps: spec.steps,
    predictedChanges: createWorkflowPlanPredictedChanges(spec, inputs),
    validation: spec.validation,
    diagnostics,
    recommendations: createWorkflowPlanRecommendations(spec, inputs),
    requiresApproval: true,
    approval: workflowPlanApproval,
  };
};

const planString = (inputs: Record<string, WorkflowInputValue>, name: string) =>
  typeof inputs[name] === "string" ? inputs[name] : null;
const planStrings = (inputs: Record<string, WorkflowInputValue>, name: string) =>
  Array.isArray(inputs[name]) ? inputs[name] : null;

const inspectRenameKeyPlan = async (workspace: Workspace, plan: WorkflowPlan): Promise<WorkflowPlan> => {
  if (plan.diagnostics.some((diagnostic) => diagnostic.severity === "error")) return plan;
  const { diagnostics, files } = await KeyRename.build(workspace, {
    app: planString(plan.inputs, "app"),
    module: planString(plan.inputs, "module"),
    slice: planString(plan.inputs, "slice"),
    query: planString(plan.inputs, "query"),
    to: planString(plan.inputs, "to"),
  });
  return {
    ...plan,
    diagnostics: [...plan.diagnostics, ...diagnostics],
    predictedChanges: files.length
      ? files.map((file) => ({ target: file.path, action: "modify", applyScope: "auto", reason: file.reason }))
      : plan.predictedChanges,
  };
};

const syssHolding = async (workspace: Workspace, module: string, except: Sys) => {
  const [apps, libs] = await workspace.getSyss();
  const others = await Promise.all(
    [...apps, ...libs]
      .filter((name) => name !== except.name)
      .map(async (name) => await resolveWorkflowSys(workspace, name)),
  );
  const holding = await Promise.all(
    others.map(async (other) => (other && (await other.readdir("lib")).includes(module) ? other : null)),
  );
  return holding.filter((other): other is Sys => other !== null);
};

const moduleMissing = async (workspace: Workspace, sys: Sys, module: string): Promise<WorkflowDiagnostic | null> => {
  if ((await sys.readdir("lib")).includes(module)) return null;
  const root = getSysRoot(sys);
  const modules = [...(await sys.getDatabaseModules()), ...(await sys.getServiceModules())];
  const sameName = modules.find((name) => name.replace(/^_/, "").toLowerCase() === module.toLowerCase());
  const isScalar = (await sys.getScalarModules()).includes(module);
  const [holder] = sameName || isScalar ? [] : await syssHolding(workspace, module, sys);
  return {
    severity: "error",
    code: "workflow-module-missing",
    input: "module",
    message: [
      `No module named ${module} in ${root}: ${root}/lib/${module} does not exist.`,
      modules.length ? `Its modules are ${modules.join(", ")}.` : `${root} has no modules yet.`,
      sameName
        ? `Did you mean ${sameName}?`
        : isScalar
          ? `${root}/lib/__scalar/${module} is a scalar, and this workflow writes only into a module under ${root}/lib.`
          : holder
            ? `${module} is in ${getSysRoot(holder)}, so plan this with --app ${holder.name}.`
            : `If ${module} is a new model, create it with the create-module workflow first, then plan this again.`,
    ].join(" "),
  };
};

export const workflowTargetDiagnostics = async (
  workspace: Workspace,
  spec: WorkflowSpec,
  inputs: Record<string, WorkflowInputValue>,
): Promise<WorkflowDiagnostic[]> => {
  const app = planString(inputs, "app");
  if (!app) return [];
  const sys = await resolveWorkflowSys(workspace, app).catch(() => null);
  if (!sys) {
    const [apps, libs] = await workspace.getSyss();
    return [
      {
        severity: "error",
        code: "workflow-target-missing",
        input: "app",
        message: `No app or library named ${app}. Apps: ${apps.join(", ") || "none"}. Libraries: ${libs.join(", ") || "none"}.`,
      },
    ];
  }
  const module = planString(inputs, "module");
  const moduleSpec: WorkflowInputSpec | undefined = spec.inputs.module;
  if (!module || !moduleSpec?.mustExist) return [];
  const missing = await moduleMissing(workspace, sys, module);
  return missing ? [missing] : [];
};

export const inspectWorkflowPlan = async (
  workspace: Workspace,
  spec: WorkflowSpec,
  plan: WorkflowPlan,
): Promise<WorkflowPlan> => {
  const targetDiagnostics = await workflowTargetDiagnostics(workspace, spec, plan.inputs);
  if (targetDiagnostics.length)
    return {
      ...plan,
      predictedChanges: [],
      diagnostics: [...plan.diagnostics, ...targetDiagnostics],
      recommendations: [],
    };
  if (plan.workflow === "rename-key") return await inspectRenameKeyPlan(workspace, plan);
  if (plan.workflow !== "add-mutation" && plan.workflow !== "create-interaction") return plan;
  const sys = await resolveWorkflowSys(workspace, planString(plan.inputs, "app")).catch(() => null);
  if (!sys) return plan;
  const inspected =
    plan.workflow === "add-mutation"
      ? await MutationScaffold.build(
          sys,
          {
            module: planString(plan.inputs, "module"),
            mutation: planString(plan.inputs, "mutation"),
            guards: planStrings(plan.inputs, "guard"),
            withCalls: planStrings(plan.inputs, "with"),
            afterCalls: planStrings(plan.inputs, "after"),
          },
          { strict: false },
        )
      : { ...(await InteractionScaffold.build(sys, planString(plan.inputs, "interaction"))), recommendations: [] };
  const failedInputs = new Set(
    plan.diagnostics.filter((diagnostic) => diagnostic.severity === "error").map((diagnostic) => diagnostic.input),
  );
  return {
    ...plan,
    diagnostics: [
      ...plan.diagnostics,
      ...inspected.diagnostics.filter((diagnostic) => !diagnostic.input || !failedInputs.has(diagnostic.input)),
    ],
    recommendations: [...plan.recommendations, ...inspected.recommendations],
  };
};
