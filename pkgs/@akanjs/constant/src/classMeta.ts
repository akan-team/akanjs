import "reflect-metadata";

import { type EnumInstance, type Type } from "@akanjs/base";

import { constantInfo } from "./constantInfo";
import { getFieldMetas } from "./scalar";

export const setExtendRef = (modelRef: Type, extendRef: Type) => {
  Reflect.defineMetadata("akan:extend", extendRef, modelRef.prototype as object);
};
export const getExtendRef = <AllowEmpty extends boolean = false>(
  modelRef: Type,
  { allowEmpty }: { allowEmpty?: AllowEmpty } = {}
) => {
  const extendRef = Reflect.getMetadata("akan:extend", modelRef.prototype as object) as Type | undefined;
  if (!extendRef && !allowEmpty) throw new Error(`ExtendRef not found - ${modelRef.name}`);
  return extendRef as AllowEmpty extends true ? Type | undefined : Type;
};

export const getChildClassRefs = (target: Type): Type[] => {
  const metadatas = getFieldMetas(target);
  const refMap = new Map<string, Type>();
  const childRefs = metadatas
    .filter((metadata) => metadata.isClass)
    .reduce((acc: Type[], metadata) => {
      return [...acc, metadata.modelRef, ...getChildClassRefs(metadata.modelRef)];
    }, []);
  childRefs
    .filter((modelRef, idx) => childRefs.findIndex((ref) => ref.prototype === modelRef.prototype) === idx)
    .map((modelRef) => refMap.set(constantInfo.getRefName(modelRef), modelRef)); // remove duplicates
  return [...refMap.values()];
};

export const getFieldEnumMetas = (modelRef: Type): { key: string; enum: EnumInstance }[] => {
  const fieldMetas = getFieldMetas(modelRef);
  return fieldMetas
    .filter((fieldMeta) => !!fieldMeta.enum)
    .map((fieldMeta) => ({ key: fieldMeta.key, enum: fieldMeta.enum }) as { key: string; enum: EnumInstance });
};

export const hasTextField = (modelRef: Type): boolean => {
  const fieldMetas = getFieldMetas(modelRef);
  return fieldMetas.some(
    (fieldMeta) =>
      !!fieldMeta.text ||
      (fieldMeta.isScalar && fieldMeta.isClass && fieldMeta.select && hasTextField(fieldMeta.modelRef))
  );
};
