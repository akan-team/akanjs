import { DEFAULT_VALUE, FIELD_META, type PrimitiveScalar } from "akanjs/base";
import type { FieldObject } from "./fieldInfo";
import type { DefaultOf } from "./types";

export interface DefaultPlan {
  /** Fields whose default is a value that can be shared: a primitive, `null`, or the field's own literal. */
  shared: Record<string, unknown>;
  /** Fields produced per call: a thunk, a fresh array, a nested scalar record, or a primitive's structured default. */
  perCall: Map<string, () => unknown>;
}

// One entry per model's FIELD_META: the database adaptor reaches this per nested scalar value per row.
const planCache = new WeakMap<FieldObject, DefaultPlan>();

/** A thunk default runs per call and an array or nested-scalar default is fresh, so no two results share one. */
export const getDefault = <T>(fieldObj: FieldObject): DefaultOf<T> => {
  const plan = defaultPlanOf(fieldObj);
  const result: Record<string, unknown> = { ...plan.shared };
  for (const [key, make] of plan.perCall) result[key] = make();
  return result as DefaultOf<T>;
};

/** Read per field by `HydrationPlan`, so a present value skips its default thunk. */
export const defaultPlanOf = (fieldObj: FieldObject): DefaultPlan => {
  const cached = planCache.get(fieldObj);
  if (cached) return cached;
  const plan = buildPlan(fieldObj);
  planCache.set(fieldObj, plan);
  return plan;
};

const buildPlan = (fieldObj: FieldObject): DefaultPlan => {
  const shared: Record<string, unknown> = {};
  const perCall = new Map<string, () => unknown>();
  for (const [key, field] of Object.entries(fieldObj)) {
    if (field.fieldType === "hidden" || field.fieldType === "secret") shared[key] = null;
    else if (field.default !== undefined && field.default !== null) {
      if (typeof field.default === "function") perCall.set(key, field.default as () => unknown);
      // An array default is the field's own array, so a shared reference would let one object's `push` reach the rest.
      else if (Array.isArray(field.default)) {
        const items = field.default as unknown[];
        perCall.set(key, () => [...items]);
      }
      // Any other literal default is the field's own object, shared by reference as it always was.
      else shared[key] = field.default as object;
    } else if (field.isArray) perCall.set(key, () => []);
    else if (field.nullable) shared[key] = null;
    else if (field.isClass) {
      if (field.isScalar) perCall.set(key, () => getDefault(field.modelRef[FIELD_META]));
      else shared[key] = null;
    } else {
      const primitiveDefault = (field.modelRef as unknown as typeof PrimitiveScalar)[DEFAULT_VALUE];
      if (isStructured(primitiveDefault)) perCall.set(key, () => structuredClone(primitiveDefault));
      else shared[key] = primitiveDefault;
    }
  }
  return { shared, perCall };
};

const isStructured = (value: unknown): value is object =>
  typeof value === "object" &&
  value !== null &&
  (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

/** Copies a plain object or array; an instance (`Dayjs`, `Uint8Array`) is returned as is, keeping its prototype. */
export const freshPrimitiveValue = <T>(value: T): T => (isStructured(value) ? structuredClone(value) : value);
