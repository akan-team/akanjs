import { DEFAULT_VALUE, dayjs, FIELD_META } from "akanjs/base";
import { freshPrimitiveValue, getDefault } from "akanjs/constant";
import type { FieldMap } from "./types";
import { decodeDateValue } from "./values";

type FieldProps = Record<string, unknown>;

export const primitiveDefault = (props: FieldProps) =>
  freshPrimitiveValue((props.modelRef as { [DEFAULT_VALUE]?: unknown } | undefined)?.[DEFAULT_VALUE]) ?? null;

const decodeMapValue = (value: unknown, props: FieldProps) => {
  if (value === undefined || value === null) return value;
  if (props.of === Date) return decodeDateValue(value);
  return value;
};

const decodeNestedValue = (value: unknown, props: FieldProps): unknown => {
  if (!value || typeof value !== "object") return value;
  if (!props.isClass || !props.isScalar) return value;
  const scalarFields = (props.modelRef as { [FIELD_META]?: FieldMap } | undefined)?.[FIELD_META];
  if (!scalarFields) return value;
  const source = value as Record<string, unknown>;
  const defaults = getDefault(scalarFields as never) as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, fieldMeta] of Object.entries(scalarFields)) {
    const nestedProps = fieldMeta.getProps();
    const nested = source[key];
    result[key] = nested === undefined ? defaults[key] : decodeFieldValue(nested, nestedProps);
  }
  for (const [key, nested] of Object.entries(source)) {
    if (!(key in result)) result[key] = nested;
  }
  return result;
};

export const decodeFieldValue = (value: unknown, props: FieldProps): unknown => {
  if (value === undefined || value === null) return value;
  if (props.isMap) {
    const entries = value instanceof Map ? [...value.entries()] : Object.entries(value as Record<string, unknown>);
    return new Map(entries.map(([key, item]) => [key, decodeMapValue(item, props)]));
  }
  if (props.modelRef === Date) {
    if (Array.isArray(value)) return value.map((item) => (item === null ? item : decodeDateValue(item)));
    return decodeDateValue(value);
  }
  if (Array.isArray(value)) return value.map((item) => decodeNestedValue(item, props));
  return decodeNestedValue(value, props);
};

const fillScalarDefaults = (value: unknown, props: FieldProps): unknown => {
  if (!value || typeof value !== "object") return value;
  const scalarFields = (props.modelRef as { [FIELD_META]?: FieldMap } | undefined)?.[FIELD_META];
  if (!scalarFields) return value;
  const defaults = getDefault(scalarFields as never) as Record<string, unknown>;
  const result = { ...(value as Record<string, unknown>) };
  for (const [key, fieldMeta] of Object.entries(scalarFields)) {
    const nestedProps = fieldMeta.getProps();
    if (result[key] === undefined) result[key] = defaults[key];
    else result[key] = normalizeWriteValue(result[key], nestedProps);
  }
  return result;
};

export const normalizeWriteValue = (value: unknown, props: FieldProps): unknown => {
  if (value === undefined || value === null) return value;
  if (props.modelRef === Date) {
    if (Array.isArray(value))
      return value.map((item) => (item === null || item === undefined ? item : dayjs(item as never)));
    return dayjs(value as never);
  }
  if (!props.isClass || !props.isScalar) return value;
  if (Array.isArray(value)) return value.map((item) => fillScalarDefaults(item, props));
  return fillScalarDefaults(value, props);
};
