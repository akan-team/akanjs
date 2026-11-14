import type { WorkflowDiagnostic } from "./types";

export const normalizeFieldType = (typeName: string) => {
  const normalizedTypes: Record<string, string> = {
    string: "String",
    boolean: "Boolean",
    date: "Date",
    int: "Int",
    integer: "Int",
    float: "Float",
    double: "Float",
    decimal: "Float",
  };
  return normalizedTypes[typeName.toLowerCase()] ?? typeName;
};

export type FieldDefaultValue = string | number | boolean | null;

const numericDefault = (typeName: "Int" | "Float", rawDefault: FieldDefaultValue): string | null => {
  if (typeof rawDefault === "number") {
    if (!Number.isFinite(rawDefault)) return null;
    if (typeName === "Int" && !Number.isInteger(rawDefault)) return null;
    return String(rawDefault);
  }
  if (typeof rawDefault !== "string") return null;
  const trimmed = rawDefault.trim();
  if (!trimmed || !Number.isFinite(Number(trimmed))) return null;
  if (typeName === "Int" && !/^-?\d+$/.test(trimmed)) return null;
  return trimmed;
};

const booleanDefault = (rawDefault: FieldDefaultValue): string | null => {
  if (typeof rawDefault === "boolean") return String(rawDefault);
  if (typeof rawDefault !== "string") return null;
  const lowered = rawDefault.trim().toLowerCase();
  return lowered === "true" || lowered === "false" ? lowered : null;
};

const dateDefault = (rawDefault: FieldDefaultValue): string | null => {
  if (typeof rawDefault === "number" && Number.isFinite(rawDefault)) return `() => dayjs(${rawDefault})`;
  if (typeof rawDefault !== "string") return null;
  const trimmed = rawDefault.trim();
  if (!trimmed) return null;
  if (trimmed === "now") return "() => dayjs()";
  if (!Number.isNaN(Date.parse(trimmed))) return `() => dayjs(${JSON.stringify(trimmed)})`;
  return null;
};

export const coerceFieldDefault = (
  typeName: string,
  defaultValue?: FieldDefaultValue,
  options: { enumValues?: readonly string[] | null } = {},
): { expression: string | null; diagnostic?: WorkflowDiagnostic; normalized: boolean; normalizedType: string } => {
  const normalizedType = typeName.toLowerCase() === "enum" ? "enum" : normalizeFieldType(typeName);
  if (defaultValue === undefined || defaultValue === null || defaultValue === "") {
    return { expression: null, normalized: false, normalizedType };
  }
  if (normalizedType === "Int" || normalizedType === "Float") {
    const expression = numericDefault(normalizedType, defaultValue);
    if (expression !== null) return { expression, normalized: typeof defaultValue === "string", normalizedType };
    return {
      expression: null,
      normalized: false,
      normalizedType,
      diagnostic: {
        severity: "error",
        code: "primitive-default-value-invalid",
        input: "default",
        failureScope: "source-change",
        message: `Default value for ${normalizedType} must be a numeric literal. Received: ${JSON.stringify(defaultValue)}.`,
      },
    };
  }
  if (normalizedType === "Boolean") {
    const expression = booleanDefault(defaultValue);
    if (expression !== null) return { expression, normalized: typeof defaultValue === "string", normalizedType };
    return {
      expression: null,
      normalized: false,
      normalizedType,
      diagnostic: {
        severity: "error",
        code: "primitive-default-value-invalid",
        input: "default",
        failureScope: "source-change",
        message: `Default value for Boolean must be true or false. Received: ${JSON.stringify(defaultValue)}.`,
      },
    };
  }
  if (normalizedType === "Date") {
    const expression = dateDefault(defaultValue);
    if (expression !== null) return { expression, normalized: true, normalizedType };
    return {
      expression: null,
      normalized: false,
      normalizedType,
      diagnostic: {
        severity: "error",
        code: "primitive-default-value-invalid",
        input: "default",
        failureScope: "source-change",
        message: `Default value for Date must be "now", a timestamp, or a parseable date string. Received: ${JSON.stringify(
          defaultValue,
        )}.`,
      },
    };
  }
  if (normalizedType === "enum") {
    if (typeof defaultValue === "string" && options.enumValues?.includes(defaultValue)) {
      return { expression: JSON.stringify(defaultValue), normalized: false, normalizedType };
    }
    return {
      expression: null,
      normalized: false,
      normalizedType,
      diagnostic: {
        severity: "error",
        code: "primitive-default-value-invalid",
        input: "default",
        failureScope: "source-change",
        message: `Default value for enum must be one of: ${(options.enumValues ?? []).join(", ")}. Received: ${JSON.stringify(
          defaultValue,
        )}.`,
      },
    };
  }
  return {
    expression: JSON.stringify(String(defaultValue)),
    normalized: typeof defaultValue !== "string",
    normalizedType,
  };
};

export const fieldExpression = (
  typeName: string,
  defaultValue?: FieldDefaultValue,
  options: { enumValues?: readonly string[] | null; builderName?: string } = {},
) => {
  const typeExpression = normalizeFieldType(typeName);
  const defaultExpression = coerceFieldDefault(
    options.enumValues ? "enum" : typeExpression,
    defaultValue,
    options,
  ).expression;
  const defaultOption = defaultExpression ? `, { default: ${defaultExpression} }` : "";
  return `${options.builderName ?? "field"}(${typeExpression}${defaultOption})`;
};

export const parseValues = (value: string | null) =>
  value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
