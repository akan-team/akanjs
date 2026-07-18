import { FIELD_META } from "akanjs/base";
import { immerable } from "immer";
import type { ConstantModelRef } from ".";

export const immerify = <T extends object>(modelRef: ConstantModelRef, objOrArr: T): T => {
  if (Array.isArray(objOrArr)) return objOrArr.map((val) => immerify(modelRef, val as object)) as T;
  const immeredObj = Object.assign({}, objOrArr, {
    [immerable]: true,
  }) as Record<string, unknown>;
  const objRecord = objOrArr as Record<string, unknown>;
  Object.entries(modelRef[FIELD_META]).forEach(([key, field]) => {
    if (field.isScalar && field.isClass && !!objRecord[key])
      immeredObj[key] = immerify(field.modelRef, objRecord[key] as object);
  });
  return immeredObj as T;
};
