import { FIELD_META } from "akanjs/base";
import { ConstantRegistry } from "./constantRegistry";
import type { FieldObject } from "./fieldInfo";

/**
 * The query a field's value stands for, declared on the field itself with `.meta(...)`. A summary counter is the
 * case this exists for: `hau` is however many rows one filter returns, so the tile showing it can open that exact
 * listing without the page restating the filter beside it.
 *
 * The shape is read structurally rather than by class, so an app declares it with whatever builder it already has.
 */
export interface FieldQueryMeta {
  /** The model the query runs against. */
  refName: string;
  /** One of that model's declared filter keys. */
  queryKey: string | null;
  /** Read when the query is applied, so an arg relative to now — `() => [dayjs().subtract(1, "hour")]` — is current. */
  queryArgs?: unknown[] | (() => unknown[]);
}

const isFieldQueryMeta = (meta: unknown): meta is FieldQueryMeta => {
  if (!meta || typeof meta !== "object") return false;
  const { refName, queryKey, queryArgs } = meta as Record<string, unknown>;
  if (typeof refName !== "string" || !refName) return false;
  if (queryKey !== null && typeof queryKey !== "string") return false;
  return queryArgs === undefined || Array.isArray(queryArgs) || typeof queryArgs === "function";
};

/** The query one field of `refName` names, or nothing when the model, the field, or the declaration is absent. */
export const fieldQueryMetaOf = (refName: string, field: string): FieldQueryMeta | undefined => {
  const cnst = ConstantRegistry.getDatabase(refName, { allowEmpty: true });
  const fieldMap = cnst?.full[FIELD_META] as FieldObject | undefined;
  const meta = fieldMap?.[field]?.meta;
  return isFieldQueryMeta(meta) ? meta : undefined;
};
