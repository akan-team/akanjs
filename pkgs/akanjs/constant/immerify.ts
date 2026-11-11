import { FIELD_META } from "akanjs/base";
import { plainFieldsOf } from "akanjs/common";
import { immerable } from "immer";
import type { ConstantModelRef } from "./via";

export const immerify = <T extends object>(modelRef: ConstantModelRef, objOrArr: T): T => {
  if (Array.isArray(objOrArr)) return objOrArr.map((val) => immerify(modelRef, val as object)) as T;
  const immeredObj = Object.assign(plainFieldsOf(objOrArr), { [immerable]: true }) as Record<string, unknown>;
  Object.entries(modelRef[FIELD_META]).forEach(([key, field]) => {
    if (field.isScalar && field.isClass && immeredObj[key])
      immeredObj[key] = immerify(field.modelRef, immeredObj[key] as object);
  });
  return immeredObj as T;
};
