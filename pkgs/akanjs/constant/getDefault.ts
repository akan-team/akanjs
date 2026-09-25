import { DEFAULT_VALUE, FIELD_META, type PrimitiveScalar } from "akanjs/base";
import type { FieldObject } from ".";
import type { DefaultOf } from "./types";

export const getDefault = <T>(fieldObj: FieldObject): DefaultOf<T> => {
  const result: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(fieldObj)) {
    if (field.fieldType === "hidden" || field.fieldType === "secret") result[key] = null;
    else if (field.default !== undefined && field.default !== null) {
      if (typeof field.default === "function") result[key] = (field.default as () => object)();
      else result[key] = field.default as object;
    } else if (field.isArray) result[key] = [];
    else if (field.nullable) result[key] = null;
    else if (field.isClass) result[key] = field.isScalar ? getDefault(field.modelRef[FIELD_META]) : null;
    else result[key] = (field.modelRef as unknown as typeof PrimitiveScalar)[DEFAULT_VALUE];
  }
  return result as DefaultOf<T>;
};
