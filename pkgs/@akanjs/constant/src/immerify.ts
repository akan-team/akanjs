import { type Type } from "@akanjs/base";
import { immerable } from "immer";

import { getFieldMetas } from ".";

export const immerify = <T extends object | object[]>(modelRef: Type, objOrArr: T): T => {
  if (Array.isArray(objOrArr)) return objOrArr.map((val) => immerify(modelRef, val as object)) as T;
  const fieldMetas = getFieldMetas(modelRef);
  const immeredObj = Object.assign({}, objOrArr, { [immerable]: true }) as Record<string, any>;
  const objRecord = objOrArr as Record<string, any>;
  fieldMetas.forEach((fieldMeta) => {
    if (fieldMeta.isScalar && fieldMeta.isClass && !!objRecord[fieldMeta.key])
      immeredObj[fieldMeta.key] = immerify(fieldMeta.modelRef, objRecord[fieldMeta.key] as object);
  });
  return immeredObj as T;
};
