import { capitalize } from "akanjs/common";
import { workflowPlanApproval } from "./artifacts";
import { coerceFieldDefault, moduleSourcePaths } from "./source";
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
    ...(!includeInLight
      ? [
          {
            code: "add-field-light-projection-choice",
            kind: "manual-action" as const,
            target: paths.constant,
            action: `Pass includeInLight=true when users should see ${field} in list/card data. Without it, the field can exist on ${capitalize(
              module,
            )}Input but stay absent from Light${capitalize(module)} projections.`,
            confidence: "medium" as const,
            message: `${module}.${field} is not selected for list/card projection data.`,
          },
        ]
      : []),
    ...(includeInLight
      ? [
          {
            code: "add-field-light-projection",
            kind: "placement" as const,
            target: paths.constant,
            confidence: "high" as const,
            message: `Add ${field} to Light${capitalize(module)} projection fields.`,
          },
        ]
      : []),
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
