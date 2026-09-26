import { DEFAULT_VALUE, FIELD_META, type PrimitiveScalar } from "akanjs/base";
import type { FieldObject } from ".";
import type { DefaultOf } from "./types";

export interface DefaultPlan {
  /** Fields whose default is a value that can be shared: a primitive, `null`, or the field's own literal. */
  shared: Record<string, unknown>;
  /**
   * Fields that have to be produced per call — a thunk, a fresh array, a nested scalar record, or a primitive's
   * structured default.
   */
  perCall: Map<string, () => unknown>;
}

// Keyed on the FIELD_META object a model owns, so one entry per model rather than per call. `via()` memoizes the
// finished record per class already; the database adaptor does not, and reached this per nested scalar value per
// row (`decodeNestedValue`, `fillScalarDefaults`).
const planCache = new WeakMap<FieldObject, DefaultPlan>();

/**
 * The split is what keeps this faithful: `default: () => dayjs()` still means "now" on every call, and an array
 * or nested-scalar default is still a fresh object, so two documents filled from the same model never end up
 * sharing one. Only values that were already shared before this cache existed live in `shared`.
 */
export const getDefault = <T>(fieldObj: FieldObject): DefaultOf<T> => {
  const plan = defaultPlanOf(fieldObj);
  const result: Record<string, unknown> = { ...plan.shared };
  for (const [key, make] of plan.perCall) result[key] = make();
  return result as DefaultOf<T>;
};

/** The per-field default rules, split as above; `HydrationPlan` reads them per field so a present value skips its thunk. */
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
      // An array default is the field's own array — the `[]` an array field is given when it declares none
      // included — so handing it out by reference would let one filled object's `push` land in the field default
      // and in every object filled from it afterwards.
      else if (Array.isArray(field.default)) {
        const items = field.default as unknown[];
        perCall.set(key, () => [...items]);
      }
      // Any other literal default is the field's own object, handed out by reference before this cache existed too.
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

/**
 * A primitive's value is never an identity, so a plain object or array — an empty editor document as a primitive's
 * `DEFAULT_VALUE` — is copied for each use, for the reason an array field default is. An instance (a `Dayjs`, a
 * `Uint8Array`) is handed back as is: its own API is how it changes, and a structured copy would drop its prototype.
 */
export const freshPrimitiveValue = <T>(value: T): T => (isStructured(value) ? structuredClone(value) : value);
