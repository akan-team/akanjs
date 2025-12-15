/* eslint-disable @typescript-eslint/no-unsafe-return */
import "reflect-metadata";

import { BaseInsight, BaseObject, ID, Int, type MergeAllTypes, type Prettify, Type } from "@akanjs/base";
import { applyMixins } from "@akanjs/common";

import { setExtendRef } from "./classMeta";
import { constantInfo } from "./constantInfo";
import {
  type ExtractFieldInfoObject,
  field,
  type FieldBuilder,
  type FieldInfoObject,
  FieldResolver,
  resolve,
} from "./fieldInfo";
import { ConstantFieldMeta, getFieldMetaMap, setFieldMetaMap } from "./scalar";
import type { NonFunctionalKeys } from "./types";

const defaultFieldMeta: Omit<ConstantFieldMeta, "key" | "modelRef"> = {
  fieldType: "property",
  immutable: false,
  select: true,
  isClass: false,
  isScalar: true,
  nullable: false,
  isArray: false,
  arrDepth: 0,
  optArrDepth: 0,
  default: null,
  isMap: false,
  meta: {},
};
const baseFieldMetaMap = new Map<string, ConstantFieldMeta>([
  ["id", { ...defaultFieldMeta, key: "id", modelRef: ID }],
  ["createdAt", { ...defaultFieldMeta, key: "createdAt", modelRef: Date }],
  ["updatedAt", { ...defaultFieldMeta, key: "updatedAt", modelRef: Date }],
  ["removedAt", { ...defaultFieldMeta, key: "removedAt", modelRef: Date, nullable: true, default: null }],
]);
const baseInsightFieldMetaMap = new Map<string, ConstantFieldMeta>([
  ["count", { ...defaultFieldMeta, key: "count", modelRef: Int, default: 0, accumulate: { $sum: 1 } }],
]);
type BaseFields = "id" | "createdAt" | "updatedAt" | "removedAt";
type WithBase<T> = T & BaseObject;
type OmitBase<T> = Omit<T, BaseFields>;
type Merge<A, B> = B & Omit<A, keyof B>;

const objectModelOf = <T>(inputRef: Type<T>, fieldMap: FieldInfoObject): Type<WithBase<T>> => {
  class ObjectModel {}
  const metadataMap = new Map([...baseFieldMetaMap, ...getFieldMetaMap(inputRef)]);
  setFieldMetaMap(ObjectModel, metadataMap);
  setExtendRef(ObjectModel, inputRef);
  constantInfo.setModelType(ObjectModel, "object");
  Object.entries(fieldMap).forEach(([key, fieldInfo]) => {
    fieldInfo.applyFieldMeta(ObjectModel, key);
  });
  return ObjectModel as unknown as Type<WithBase<T>>;
};

const lightModelOf = <T, F extends keyof OmitBase<T>>(
  objectRef: Type<T>,
  fields: readonly F[],
  fieldMap: FieldInfoObject,
  ...libLightModelRefs: Type[]
): Type<Pick<OmitBase<T>, F> & BaseObject> => {
  const objectFieldMetaMap = getFieldMetaMap(objectRef);

  const baseLightModelRef = libLightModelRefs.at(0);
  const fieldMetaMap = baseLightModelRef
    ? getFieldMetaMap(baseLightModelRef)
    : new Map<string, ConstantFieldMeta>([...baseFieldMetaMap]);

  class BaseLightModel {}

  for (const field of fields) {
    const fieldMeta = objectFieldMetaMap.get(field as string);
    if (!fieldMeta) throw new Error(`Field ${field as string} not found in objectRef`);
    fieldMetaMap.set(field as string, fieldMeta);
  }
  applyMixins(BaseLightModel, libLightModelRefs);
  setFieldMetaMap(BaseLightModel, fieldMetaMap);
  setExtendRef(BaseLightModel, objectRef);
  constantInfo.setModelType(BaseLightModel, "light");
  Object.entries(fieldMap).forEach(([key, fieldInfo]) => {
    fieldInfo.applyFieldMeta(BaseLightModel, key);
  });
  return BaseLightModel as unknown as Type<Pick<OmitBase<T>, F> & BaseObject>;
};

const fullModelOf = <A, B = undefined>(
  objectRef: Type<A>,
  lightRef: Type<B>,
  fieldMap: FieldInfoObject,
  ...libFullModelRefs: Type[]
): Type<Merge<A, B>> => {
  const fullRef = libFullModelRefs.at(0) ?? class FullModel {};
  const fieldMetaMap = new Map([...getFieldMetaMap(objectRef), ...getFieldMetaMap(lightRef)]);
  applyMixins(fullRef, [objectRef, lightRef, ...libFullModelRefs]);
  libFullModelRefs.forEach((libFullModelRef) => {
    applyMixins(libFullModelRef, [objectRef, lightRef]);
  });
  setFieldMetaMap(fullRef, fieldMetaMap);
  setExtendRef(fullRef, objectRef);
  constantInfo.setModelType(fullRef, "full");
  Object.entries(fieldMap).forEach(([key, fieldInfo]) => {
    fieldInfo.applyFieldMeta(fullRef, key);
  });
  return fullRef as unknown as Type<Omit<A, keyof B> & B>;
};

const makeBaseScalar = <FieldMap extends FieldInfoObject>(
  fieldMap: FieldMap
): Type<ExtractFieldInfoObject<FieldMap>> => {
  class BaseScalar {}
  constantInfo.setModelType(BaseScalar, "scalar");
  Object.entries(fieldMap).forEach(([key, fieldInfo]) => {
    fieldInfo.applyFieldMeta(BaseScalar, key);
  });
  return BaseScalar as Type<ExtractFieldInfoObject<FieldMap>>;
};

// light via
export function via<
  T extends BaseObject,
  K extends NonFunctionalKeys<OmitBase<T>>,
  ResolveField extends (resolve: FieldResolver) => FieldInfoObject,
  LightModels extends Type[],
>(
  modelRef: Type<T>,
  fields: readonly K[],
  resolveField: ResolveField,
  ...lightModelRefs: LightModels
): Type<
  Prettify<MergeAllTypes<LightModels> & Pick<T, K> & BaseObject & ExtractFieldInfoObject<ReturnType<ResolveField>>>
>;

// input via
export function via<BuildField extends (builder: FieldBuilder) => FieldInfoObject, Inputs extends Type[]>(
  buildField: BuildField,
  ...extendInputRefs: Inputs
): Type<MergeAllTypes<Inputs> & ExtractFieldInfoObject<ReturnType<BuildField>>>;

// insight via
export function via<
  T extends BaseObject,
  BuildField extends (builder: FieldBuilder) => FieldInfoObject,
  Insights extends Type[],
>(
  modelRef: Type<T>,
  buildField: BuildField,
  ...extendInsightRefs: Insights
): Type<MergeAllTypes<Insights> & BaseInsight & ExtractFieldInfoObject<ReturnType<BuildField>>>;

// object via
export function via<T, BuildField extends (builder: FieldBuilder) => FieldInfoObject, ObjectModels extends Type[]>(
  inputRef: Type<T>,
  buildField: BuildField,
  ...extendObjectRefs: ObjectModels
): Type<Prettify<MergeAllTypes<ObjectModels> & T & BaseObject & ExtractFieldInfoObject<ReturnType<BuildField>>>>;

// full via
export function via<
  T,
  Light,
  ResolveField extends (resolve: FieldResolver) => FieldInfoObject,
  FullModels extends Type[],
>(
  objectRef: Type<T>,
  lightModelRef: Type<Light>,
  resolveField: ResolveField,
  ...fullModelRefs: FullModels
): Type<Prettify<MergeAllTypes<FullModels> & T & Light & ExtractFieldInfoObject<ReturnType<ResolveField>>>>;

export function via(
  firstRefOrBuildField: Type | ((builder: FieldBuilder) => FieldInfoObject),
  secondRefOrFieldsOrBuildField?: Type | readonly any[] | ((builder: FieldBuilder) => FieldInfoObject),
  thirdRefOrResolveField?: Type | ((resolve: FieldResolver) => FieldInfoObject),
  ...extendRefs: Type[]
): any {
  // input via
  if (
    !firstRefOrBuildField.prototype ||
    !constantInfo.getModelType(firstRefOrBuildField as Type, { allowEmpty: true })
  ) {
    const buildField = firstRefOrBuildField as (builder: FieldBuilder) => FieldInfoObject;
    const fieldMap = buildField(field);
    const extendInputRefs = [
      ...(secondRefOrFieldsOrBuildField ? [secondRefOrFieldsOrBuildField as Type] : []),
      ...(thirdRefOrResolveField ? [thirdRefOrResolveField as Type] : []),
      ...extendRefs,
    ] as Type[];
    if (!secondRefOrFieldsOrBuildField) return makeBaseScalar(fieldMap);
    else return extendModelInputs(fieldMap, ...extendInputRefs);
  }
  // light via
  if (Array.isArray(secondRefOrFieldsOrBuildField)) {
    const resolveField = thirdRefOrResolveField as (resolve: FieldResolver) => FieldInfoObject;
    const fieldMap = resolveField(resolve);
    return lightModelOf(
      firstRefOrBuildField as Type,
      secondRefOrFieldsOrBuildField as readonly any[],
      fieldMap,
      ...extendRefs
    );
  }

  // insight or object via
  if (
    !(secondRefOrFieldsOrBuildField as Type).prototype ||
    !constantInfo.getModelType(secondRefOrFieldsOrBuildField as Type, { allowEmpty: true })
  ) {
    const buildField = secondRefOrFieldsOrBuildField as (builder: FieldBuilder) => FieldInfoObject;
    const fieldMap = buildField(field);
    // object via
    if (constantInfo.isScalar(firstRefOrBuildField as Type)) {
      if (!thirdRefOrResolveField) return objectModelOf(firstRefOrBuildField as Type, fieldMap);
      else
        return extendModelObjects(
          firstRefOrBuildField as Type,
          fieldMap,
          thirdRefOrResolveField as Type,
          ...extendRefs
        );
    }
    // insight via
    if (constantInfo.isFull(firstRefOrBuildField as Type)) {
      const extendInsightRefs = [
        ...(thirdRefOrResolveField ? [thirdRefOrResolveField as Type] : []),
        ...extendRefs,
      ] as Type[];
      return extendModelInsights(fieldMap, ...extendInsightRefs);
    }
  } else {
    const objectRef = firstRefOrBuildField as Type;
    const lightRef = secondRefOrFieldsOrBuildField as Type;
    const resolveField = thirdRefOrResolveField as (resolve: FieldResolver) => FieldInfoObject;
    const fieldMap = resolveField(resolve);
    return fullModelOf(objectRef, lightRef, fieldMap, ...extendRefs);
  }
  throw new Error(
    `Invalid modelRef args ${firstRefOrBuildField as Type} ${secondRefOrFieldsOrBuildField as Type} ${extendRefs.join(", ")}`
  );
}

const extendModelInputs = <T extends Type[]>(
  fieldMap: FieldInfoObject,
  ...libInputModelRefs: T
): Type<MergeAllTypes<T>> => {
  const baseInputModelRef = libInputModelRefs.at(0);
  const fieldMetaMap = baseInputModelRef ? getFieldMetaMap(baseInputModelRef) : new Map<string, ConstantFieldMeta>();
  class BaseInput {}
  setFieldMetaMap(BaseInput, fieldMetaMap);
  constantInfo.setModelType(BaseInput, "scalar");
  Object.entries(fieldMap).forEach(([key, fieldInfo]) => {
    fieldInfo.applyFieldMeta(BaseInput, key);
  });
  return BaseInput as any;
};

const extendModelObjects = <Input, ObjectModels extends Type[]>(
  inputRef: Type<Input>,
  fieldMap: FieldInfoObject,
  ...libObjectModelRefs: ObjectModels
): Type<MergeAllTypes<ObjectModels> & Input> => {
  const baseObjectModelRef = libObjectModelRefs.at(0);
  const inputFieldMetaMap = getFieldMetaMap(inputRef);
  const fieldMetaMap = baseObjectModelRef ? getFieldMetaMap(baseObjectModelRef) : new Map<string, ConstantFieldMeta>();
  class BaseInput {}
  inputFieldMetaMap.forEach((value, key) => fieldMetaMap.set(key, value));
  setFieldMetaMap(BaseInput, fieldMetaMap);
  constantInfo.setModelType(BaseInput, "object");
  Object.entries(fieldMap).forEach(([key, fieldInfo]) => {
    fieldInfo.applyFieldMeta(BaseInput, key);
  });
  return BaseInput as any;
};

const extendModelInsights = <InsightModels extends Type[]>(
  fieldMap: FieldInfoObject,
  ...insightModelRefs: InsightModels
): Type<MergeAllTypes<InsightModels>> => {
  const baseInsightModelRef = insightModelRefs.at(0);
  const insightFieldMetaMap = baseInsightModelRef
    ? getFieldMetaMap(baseInsightModelRef)
    : new Map<string, ConstantFieldMeta>([...baseInsightFieldMetaMap]);
  class BaseInsight {}
  setFieldMetaMap(BaseInsight, insightFieldMetaMap);
  constantInfo.setModelType(BaseInsight, "insight");
  Object.entries(fieldMap).forEach(([key, fieldInfo]) => {
    fieldInfo.applyFieldMeta(BaseInsight, key);
  });
  return BaseInsight as any;
};
