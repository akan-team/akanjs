import { type Type } from "@akanjs/base";
import { getFieldMetas } from "@akanjs/constant";
import { immerable } from "immer";

export const immerify = <T extends object | object[]>(modelRef: Type, objOrArr: T): T => {
  if (Array.isArray(objOrArr)) return objOrArr.map((val) => immerify(modelRef, val as object)) as T;
  const fieldMetas = getFieldMetas(modelRef);
  const immeredObj = Object.assign({}, objOrArr, { [immerable]: true });
  fieldMetas.forEach((fieldMeta) => {
    if (fieldMeta.isScalar && fieldMeta.isClass && !!objOrArr[fieldMeta.key])
      immeredObj[fieldMeta.key] = immerify(fieldMeta.modelRef, objOrArr[fieldMeta.key] as object);
  });
  return immeredObj;
};
