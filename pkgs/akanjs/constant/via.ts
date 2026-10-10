import {
  Binary,
  CLIENT_VALUE,
  type Cls,
  DEFAULT_VALUE,
  type EnumInstance,
  FIELD_META,
  ImageResult,
  type ObjectAssign,
  type ObjectAssignKeyOfObjects,
  PURIFIED_VALUE,
  SERVER_VALUE,
} from "akanjs/base";
import { applyMixins, plainFieldsOf } from "akanjs/common";
import { immerable } from "immer";

import { getDefault } from ".";
import { CascadePaths } from "./cascadePaths";
import { ConstantRegistry } from "./constantRegistry";
import { dateAccessorOf, isDateSlotField } from "./dateSlot";
import {
  ConstantField,
  type ExtractFieldInfoObject,
  type FieldBuilder,
  type FieldInfoObject,
  type FieldInfoObjectToFieldObject,
  type FieldObject,
  type FieldResolver,
  field,
  resolve,
} from "./fieldInfo";
import { HydrationPlan } from "./hydrationPlan";
import { makePurify, type PurifiedModel, type PurifyFunc } from "./purify";
import { TextFieldPaths } from "./textFieldPaths";
import type { BaseInsight, BaseObject, ConstantType, DefaultOf, DefaultOfSchema, NonFunctionalKeys } from "./types";

type BaseFields = "id" | "createdAt" | "updatedAt" | "removedAt";
type WithBase<T> = T & BaseObject;
type OmitBase<T> = Omit<T, BaseFields>;
type Merge<A, B> = B & Omit<A, keyof B>;
type MergeOwnSchemas<Models extends object[]> = ObjectAssignKeyOfObjects<Models, "_OwnSchema">;
type MergeOwnFieldObjects<Models extends object[]> = ObjectAssignKeyOfObjects<Models, "_OwnFieldObj">;
type MergeWithOwnSchemas<Models extends object[], OwnSchema extends object> = ObjectAssign<
  [MergeOwnSchemas<Models>, OwnSchema]
>;
type MergeWithOwnFieldObjects<Models extends object[], OwnFieldObj extends object> = ObjectAssign<
  [MergeOwnFieldObjects<Models>, OwnFieldObj]
>;
type BuiltSchema<BuildField extends (builder: FieldBuilder) => FieldInfoObject> = ExtractFieldInfoObject<
  ReturnType<BuildField>
>;
type BuiltFieldObject<BuildField extends (builder: FieldBuilder) => FieldInfoObject> = FieldInfoObjectToFieldObject<
  ReturnType<BuildField>
>;
type ResolvedSchema<ResolveField extends (resolve: FieldResolver) => FieldInfoObject> = ExtractFieldInfoObject<
  ReturnType<ResolveField>
>;
type ResolvedFieldObject<ResolveField extends (resolve: FieldResolver) => FieldInfoObject> =
  FieldInfoObjectToFieldObject<ReturnType<ResolveField>>;

const toFieldObject = (fieldMap: FieldInfoObject): FieldObject =>
  Object.fromEntries(Object.entries(fieldMap).map(([key, field]) => [key, field.toField()]));

const objectModelOf = <T>(inputRef: ConstantCls<T>, fieldMap: FieldInfoObject) => {
  const applyFieldObject = { ...inputRef[FIELD_META], ...toFieldObject(fieldMap) };
  const field = Object.assign(ConstantField.getBaseModelField(), applyFieldObject);
  const baseObjectModelRef = getBaseConstantClass(field);
  applyConstantStatics(baseObjectModelRef, applyFieldObject);
  baseObjectModelRef.modelType = "object";
  return baseObjectModelRef as unknown as ConstantCls<WithBase<T>, FieldObject, WithBase<T>, FieldObject, "object">;
};

const lightModelOf = <T, F extends keyof OmitBase<T>>(
  objectRef: ConstantCls<T>,
  fields: readonly F[],
  fieldMap: FieldInfoObject,
  ...libLightModelRefs: ConstantCls[]
) => {
  const libLightModelRef = libLightModelRefs.at(0);
  const applyFieldObject = {
    ...toFieldObject(fieldMap),
    ...Object.fromEntries(fields.map((field) => [field, objectRef[FIELD_META][field as string] as ConstantField])),
  };
  const field = Object.assign(libLightModelRef?.[FIELD_META] ?? ConstantField.getBaseModelField(), applyFieldObject);
  const baseLightModelRef = getBaseConstantClass(field);
  applyConstantStatics(baseLightModelRef, applyFieldObject);
  applyMixins(baseLightModelRef, libLightModelRefs);
  baseLightModelRef.modelType = "light";
  return baseLightModelRef as unknown as ConstantCls<
    Pick<OmitBase<T>, F> & BaseObject,
    FieldObject,
    Pick<OmitBase<T>, F> & BaseObject,
    FieldObject,
    "light"
  >;
};

const fullModelOf = <A, B = undefined>(
  objectRef: ConstantCls<A>,
  lightRef: ConstantCls<B>,
  fieldMap: FieldInfoObject,
  ...libFullModelRefs: ConstantCls[]
) => {
  const fullRef = libFullModelRefs.at(0) ?? getBaseConstantClass(ConstantField.getBaseModelField());
  const applyFieldObject = { ...objectRef[FIELD_META], ...lightRef[FIELD_META], ...toFieldObject(fieldMap) };
  Object.assign(fullRef[FIELD_META], applyFieldObject);
  applyMixins(fullRef, [objectRef, lightRef, ...libFullModelRefs]);
  for (const libFullModelRef of libFullModelRefs) applyMixins(libFullModelRef, [objectRef, lightRef]);
  applyConstantStatics(fullRef, applyFieldObject);
  fullRef.modelType = "full";
  return fullRef as unknown as ConstantCls<Merge<A, B>, FieldObject, Merge<A, B>, FieldObject, "full">;
};

const extendModelInputs = <T extends ConstantCls[]>(fieldMap: FieldInfoObject, ...libInputModelRefs: T) => {
  const baseInputModelRef = libInputModelRefs.at(0);
  const applyFieldObject = toFieldObject(fieldMap);
  const fieldObject = Object.assign(baseInputModelRef?.[FIELD_META] ?? {}, applyFieldObject);
  const baseInputRef = getBaseConstantClass(fieldObject);
  applyConstantStatics(baseInputRef, applyFieldObject);
  return baseInputRef as unknown as ConstantCls<
    MergeOwnSchemas<T>,
    FieldObject,
    MergeOwnSchemas<T>,
    FieldObject,
    "input"
  >;
};

const extendModelObjects = <Input, ObjectModels extends ConstantCls[]>(
  inputRef: ConstantCls<Input>,
  fieldMap: FieldInfoObject,
  ...libObjectModelRefs: ObjectModels
) => {
  const baseObjectModelRef = libObjectModelRefs.at(0);
  const applyFieldObject = { ...inputRef[FIELD_META], ...toFieldObject(fieldMap) };
  const field = Object.assign(baseObjectModelRef?.[FIELD_META] ?? {}, applyFieldObject);
  const baseInputRef = getBaseConstantClass(field, "object");
  applyConstantStatics(baseInputRef, applyFieldObject);
  return baseInputRef as unknown as ConstantCls<
    MergeWithOwnSchemas<ObjectModels, Input & object>,
    FieldObject,
    MergeWithOwnSchemas<ObjectModels, Input & object>,
    FieldObject,
    "object"
  >;
};

const extendModelInsights = <InsightModels extends ConstantCls[]>(
  fieldMap: FieldInfoObject,
  ...insightModelRefs: InsightModels
) => {
  const baseInsightModelRef = insightModelRefs.at(0);
  const applyFieldObject = toFieldObject(fieldMap);
  const field = Object.assign(
    baseInsightModelRef?.[FIELD_META] ?? ConstantField.getBaseInsightField(),
    applyFieldObject,
  );
  const baseInsightRef = getBaseConstantClass(field, "insight");
  applyConstantStatics(baseInsightRef, applyFieldObject);
  return baseInsightRef as unknown as ConstantCls<
    MergeOwnSchemas<InsightModels>,
    FieldObject,
    MergeOwnSchemas<InsightModels>,
    FieldObject,
    "insight"
  >;
};

const getBaseConstantClass = (field: FieldObject, modelType: ConstantType = "scalar") => {
  class BaseConstant {
    static readonly [FIELD_META]: FieldObject = field;
    static modelType: ConstantType = modelType;
    static text: TextFieldPaths = new TextFieldPaths();
    static cascade: CascadePaths = new CascadePaths();
    static children: Set<ConstantModelRef> = new Set();
    static relations: Set<ConstantModelRef> = new Set();
    static enums: Set<EnumInstance> = new Set();
    [immerable] = true;
    constructor(obj?: Partial<unknown>) {
      HydrationPlan.of(this.constructor as ConstantCls).construct(this, obj as Record<string, unknown> | undefined);
    }
    set(obj: Partial<typeof this>) {
      HydrationPlan.of(this.constructor as ConstantCls).assign(this, obj as Record<string, unknown>);
      return this;
    }
    // Date fields live behind prototype accessors, which `JSON.stringify` alone would skip.
    toJSON() {
      return plainFieldsOf(this);
    }
  }
  return BaseConstant as unknown as ConstantCls;
};

const makeBaseScalar = <FieldMap extends FieldInfoObject>(fieldMap: FieldMap) => {
  const fieldObject = toFieldObject(fieldMap);
  const baseScalarRef = getBaseConstantClass(fieldObject, "scalar");
  applyConstantStatics(baseScalarRef, fieldObject);
  return baseScalarRef as unknown as ConstantCls<
    ExtractFieldInfoObject<FieldMap>,
    FieldObject,
    ExtractFieldInfoObject<FieldMap>,
    FieldObject,
    "scalar"
  >;
};

export interface ConstantMethods<Schema = any> {
  set(obj: Partial<Schema>): this;
}

type DatabaseSchemaOf<Schema, HiddenKey> = {
  [K in keyof Schema]: K extends HiddenKey ? NonNullable<Schema[K]> : Schema[K];
};

export interface ConstantStatics<
  Schema = any,
  OwnSchema = Schema,
  OwnFieldObj extends FieldObject = FieldObject,
  OptionalKey = never,
  RelationKey = never,
  PrimitiveKey = never,
  ScalarKey = never,
  EnumKey = never,
  MapKey = never,
  HiddenKey = never,
  SecretKey = never,
  ModelType extends ConstantType = ConstantType,
> {
  [FIELD_META]: FieldObject;
  getDefault: () => DefaultOfSchema<Schema, RelationKey>;
  purify: PurifyFunc<Schema>;
  modelType: ConstantType;
  children: Set<ConstantModelRef>;
  relations: Set<ConstantModelRef>;
  enums: Set<EnumInstance>;
  text: TextFieldPaths;
  cascade: CascadePaths;
  _OptionalKey: OptionalKey;
  _RelationKey: RelationKey;
  _PrimitiveKey: PrimitiveKey;
  _ScalarKey: ScalarKey;
  _EnumKey: EnumKey;
  _MapKey: MapKey;
  _HiddenKey: HiddenKey;
  _SecretKey: SecretKey;
  _OwnSchema: OwnSchema;
  _OwnFieldObj: OwnFieldObj;
  _DatabaseSchema: DatabaseSchemaOf<Schema, HiddenKey>;
  _ModelType: ModelType;
  [SERVER_VALUE]: Schema;
  [CLIENT_VALUE]: Schema;
  [DEFAULT_VALUE]: DefaultOfSchema<Schema, RelationKey>;
  [PURIFIED_VALUE]: PurifiedModel<Schema>;
}

export interface DatabaseConstantStatics<Schema = any, FieldObj extends FieldObject = FieldObject> {
  [FIELD_META]: FieldObj;
  getDefault: () => DefaultOf<Schema>;
  purify: PurifyFunc<Schema>;
  modelType: ConstantType;
  children: Set<ConstantModelRef>;
  relations: Set<ConstantModelRef>;
  enums: Set<EnumInstance>;
  text: TextFieldPaths;
  cascade: CascadePaths;
  _DatabaseSchema: {
    [K in keyof Schema]: K extends keyof FieldObj
      ? FieldObj[K]["fieldType"] extends "hidden"
        ? NonNullable<Schema[K]>
        : Schema[K]
      : Schema[K];
  };
}

export type ConstantModelRef<
  Schema = any,
  FieldObj extends FieldObject = FieldObject,
  ModelType extends ConstantType = ConstantType,
> = Cls<
  Schema,
  {
    [FIELD_META]: FieldObj;
    modelType: ModelType;
    children: Set<ConstantModelRef>;
    relations: Set<ConstantModelRef>;
    enums: Set<EnumInstance>;
    text: TextFieldPaths;
    cascade: CascadePaths;
  }
>;

export type DocumentConstantModelRef<
  Schema = any,
  FieldObj extends FieldObject = FieldObject,
  ModelType extends ConstantType = ConstantType,
  DatabaseSchema = DatabaseSchemaOf<Schema, never>,
> = Cls<
  Schema,
  {
    [FIELD_META]: FieldObj;
    modelType: ModelType;
    _DatabaseSchema: DatabaseSchema;
    _ModelType: ModelType;
  }
>;

type FieldFlag =
  | "nullable"
  | "_isRelation"
  | "_isPrimitive"
  | "_isScalar"
  | "_isEnum"
  | "_isHidden"
  | "_isSecret"
  | "_isMap";
type TrueFieldFlag<Flag extends FieldFlag> = { readonly [K in Flag]: true };
type KeysByFlag<FieldObj extends FieldObject, Flag extends FieldFlag> = {
  [K in keyof FieldObj]: FieldObj[K] extends TrueFieldFlag<Flag> ? K : never;
}[keyof FieldObj];
type OptionalKeys<FieldObj extends FieldObject> = KeysByFlag<FieldObj, "nullable">;
type RelationKeys<FieldObj extends FieldObject> = KeysByFlag<FieldObj, "_isRelation">;
type PrimitiveKeys<FieldObj extends FieldObject> = KeysByFlag<FieldObj, "_isPrimitive">;
type ScalarKeys<FieldObj extends FieldObject> = KeysByFlag<FieldObj, "_isScalar">;
type EnumKeys<FieldObj extends FieldObject> = KeysByFlag<FieldObj, "_isEnum">;
type HiddenKeys<FieldObj extends FieldObject> = KeysByFlag<FieldObj, "_isHidden">;
type SecretKeys<FieldObj extends FieldObject> = KeysByFlag<FieldObj, "_isSecret">;
type MapKeys<FieldObj extends FieldObject> = KeysByFlag<FieldObj, "_isMap">;
type ConstantKeyChannelMap = {
  optional: unknown;
  relation: unknown;
  primitive: unknown;
  scalar: unknown;
  enum: unknown;
  map: unknown;
  hidden: unknown;
  secret: unknown;
};
type IsBroadFieldObject<FieldObj extends FieldObject> = string extends keyof FieldObj ? true : false;
type ConstantKeyChannels<FieldObj extends FieldObject> =
  IsBroadFieldObject<FieldObj> extends true
    ? {
        optional: never;
        relation: never;
        primitive: never;
        scalar: never;
        enum: never;
        map: never;
        hidden: never;
        secret: never;
      }
    : {
        optional: OptionalKeys<FieldObj>;
        relation: RelationKeys<FieldObj>;
        primitive: PrimitiveKeys<FieldObj>;
        scalar: ScalarKeys<FieldObj>;
        enum: EnumKeys<FieldObj>;
        map: MapKeys<FieldObj>;
        hidden: HiddenKeys<FieldObj>;
        secret: SecretKeys<FieldObj>;
      };

export type ConstantCls<
  Schema = any,
  FieldObj extends FieldObject = FieldObject,
  OwnSchema = Schema,
  OwnFieldObj extends FieldObject = FieldObj,
  ModelType extends ConstantType = ConstantType,
  _Channels extends ConstantKeyChannelMap = ConstantKeyChannels<FieldObj>,
> = (new (
  obj?: Partial<Schema>,
) => Schema & ConstantMethods<Schema>) &
  ConstantStatics<
    Schema,
    OwnSchema,
    OwnFieldObj,
    _Channels["optional"],
    _Channels["relation"],
    _Channels["primitive"],
    _Channels["scalar"],
    _Channels["enum"],
    _Channels["map"],
    _Channels["hidden"],
    _Channels["secret"],
    ModelType
  >;

declare global {
  // Lets `Date`, `String`, `Boolean` and `Map` type-check where a constant model class is expected.
  interface DateConstructor extends DatabaseConstantStatics<unknown> {}
  interface StringConstructor extends DatabaseConstantStatics<unknown> {}
  interface BooleanConstructor extends DatabaseConstantStatics<unknown> {}
  interface MapConstructor extends DatabaseConstantStatics<unknown> {}
}

const applyConstantStatics = <Model>(model: ConstantCls<Model>, fieldMap: FieldObject): ConstantCls<Model> => {
  // Lazy: a `default: () => getEnv()...` thunk needs the runtime env, which `akan build` has not injected.
  let defaultValue: DefaultOf<Model> | undefined;
  Object.assign(model, {
    purify: makePurify(model),
    getDefault: () => {
      defaultValue ??= getDefault<Model>(model[FIELD_META]);
      return { ...defaultValue };
    },
  });
  Object.entries(fieldMap).forEach(([key, field]) => {
    for (const unstorable of [Binary, ImageResult])
      if ((field.modelRef as unknown) === unstorable || (field.of as unknown) === unstorable)
        throw new Error(
          `Field "${key}" is ${unstorable.refName}, which is not storable. Reference the File model instead.`,
        );
    if (field.enum) model.enums.add(field.enum);
    if (!field.isClass) return;
    if (field.isScalar) model.children.add(field.modelRef);
    else model.relations.add(field.modelRef);
    for (const child of field.modelRef.children) model.children.add(child);
    for (const childEnum of field.modelRef.enums) model.enums.add(childEnum);
    for (const relation of field.modelRef.relations) model.relations.add(relation);
  });
  model.text.collect(fieldMap);
  model.cascade.collect(fieldMap);
  // All of `FIELD_META`, not `fieldMap`: `fullModelOf` extends a lib model's map in place with the app's fields.
  for (const [key, field] of Object.entries(model[FIELD_META]))
    if (isDateSlotField(field.getProps())) Object.defineProperty(model.prototype, key, dateAccessorOf(key));
  HydrationPlan.reset(model);
  return model as unknown as ConstantCls<Model>;
};

export function via<
  Obj extends BaseObject,
  ObjFieldObj extends FieldObject,
  K extends NonFunctionalKeys<OmitBase<Obj>>,
  ResolveField extends (resolve: FieldResolver) => FieldInfoObject,
  LightModels extends Cls[],
  _DirectSchema extends object = ObjectAssign<[Pick<Obj, K> & BaseObject, ResolvedSchema<ResolveField>]>,
  _Schema extends object = MergeWithOwnSchemas<LightModels, _DirectSchema>,
  _DirectFieldObj extends FieldObject = ObjectAssign<
    [Pick<ObjFieldObj, K & keyof ObjFieldObj>, ResolvedFieldObject<ResolveField>]
  >,
  _FieldObj extends FieldObject = MergeWithOwnFieldObjects<LightModels, _DirectFieldObj> & FieldObject,
>(
  modelRef: Cls<Obj, { [FIELD_META]: ObjFieldObj }>,
  fields: readonly K[],
  resolveField: ResolveField,
  ...lightModelRefs: LightModels
): ConstantCls<_Schema, _FieldObj, _Schema, _FieldObj, "light">;

export function via<
  BuildField extends (builder: FieldBuilder) => FieldInfoObject,
  _DirectSchema extends object = BuiltSchema<BuildField>,
  _DirectFieldObj extends FieldObject = BuiltFieldObject<BuildField>,
>(
  buildField: BuildField,
): ConstantCls<_DirectSchema, _DirectFieldObj, _DirectSchema, _DirectFieldObj, "input" | "scalar">;

export function via<
  BuildField extends (builder: FieldBuilder) => FieldInfoObject,
  FirstInput extends Cls,
  Inputs extends Cls[],
  _DirectSchema extends object = BuiltSchema<BuildField>,
  _InputRefs extends Cls[] = [FirstInput, ...Inputs],
  _Schema extends object = MergeWithOwnSchemas<_InputRefs, _DirectSchema>,
  _DirectFieldObj extends FieldObject = BuiltFieldObject<BuildField>,
  _FieldObj extends FieldObject = MergeWithOwnFieldObjects<_InputRefs, _DirectFieldObj> & FieldObject,
>(
  buildField: BuildField,
  firstExtendInputRef: FirstInput,
  ...extendInputRefs: Inputs
): ConstantCls<_Schema, _FieldObj, _Schema, _FieldObj, "input">;

export function via<
  Full extends BaseObject,
  BuildField extends (builder: FieldBuilder) => FieldInfoObject,
  Insights extends Cls[],
  _DirectSchema extends object = ObjectAssign<[BaseInsight, BuiltSchema<BuildField>]>,
  _Schema extends object = MergeWithOwnSchemas<Insights, _DirectSchema>,
  _DirectFieldObj extends FieldObject = BuiltFieldObject<BuildField>,
  _FieldObj extends FieldObject = MergeWithOwnFieldObjects<Insights, _DirectFieldObj> & FieldObject,
>(
  modelRef: Cls<Full>,
  buildField: BuildField,
  ...extendInsightRefs: Insights
): ConstantCls<_Schema, _FieldObj, _Schema, _FieldObj, "insight">;

export function via<
  Input,
  InputFieldObj extends FieldObject,
  BuildField extends (builder: FieldBuilder) => FieldInfoObject,
  ObjectModels extends Cls[],
  _DirectSchema extends object = ObjectAssign<[Input & object, BaseObject, BuiltSchema<BuildField>]>,
  _Schema extends object = MergeWithOwnSchemas<ObjectModels, _DirectSchema>,
  _DirectFieldObj extends FieldObject = ObjectAssign<[InputFieldObj, BuiltFieldObject<BuildField>]>,
  _FieldObj extends FieldObject = MergeWithOwnFieldObjects<ObjectModels, _DirectFieldObj> & FieldObject,
>(
  inputRef: Cls<Input, { [FIELD_META]: InputFieldObj }>,
  buildField: BuildField,
  ...extendObjectRefs: ObjectModels
): ConstantCls<_Schema, _FieldObj, _Schema, _FieldObj, "object">;

export function via<
  Obj,
  ObjFieldObj extends FieldObject,
  Light,
  LightFieldObj extends FieldObject,
  ResolveField extends (resolve: FieldResolver) => FieldInfoObject,
  FullModels extends Cls[],
  _DirectSchema extends object = ObjectAssign<[Obj & object, Light & object, ResolvedSchema<ResolveField>]>,
  _Schema extends object = MergeWithOwnSchemas<FullModels, _DirectSchema>,
  _DirectFieldObj extends FieldObject = ObjectAssign<[ObjFieldObj, LightFieldObj, ResolvedFieldObject<ResolveField>]>,
  _FieldObj extends FieldObject = MergeWithOwnFieldObjects<FullModels, _DirectFieldObj> & FieldObject,
>(
  objectRef: Cls<Obj, { [FIELD_META]: ObjFieldObj }>,
  lightModelRef: Cls<Light, { [FIELD_META]: LightFieldObj }>,
  resolveField: ResolveField,
  ...fullModelRefs: FullModels
): ConstantCls<_Schema, _FieldObj, _Schema, _FieldObj, "full">;

export function via(
  firstRefOrBuildField: Cls | ((builder: FieldBuilder) => FieldInfoObject),
  secondRefOrFieldsOrBuildField?: Cls | readonly unknown[] | ((builder: FieldBuilder) => FieldInfoObject),
  thirdRefOrResolveField?: Cls | ((resolve: FieldResolver) => FieldInfoObject),
  ...extendRefs: Cls[]
): any {
  if (
    !firstRefOrBuildField.prototype ||
    !(firstRefOrBuildField as Cls<unknown, { modelType?: ConstantType }>).modelType
  ) {
    const buildField = firstRefOrBuildField as (builder: FieldBuilder) => FieldInfoObject;
    const fieldMap = buildField(field);
    const extendInputRefs = [
      ...(secondRefOrFieldsOrBuildField ? [secondRefOrFieldsOrBuildField as Cls] : []),
      ...(thirdRefOrResolveField ? [thirdRefOrResolveField as Cls] : []),
      ...extendRefs,
    ] as ConstantCls[];
    if (!secondRefOrFieldsOrBuildField) return makeBaseScalar(fieldMap);
    else return extendModelInputs(fieldMap, ...extendInputRefs);
  }
  if (Array.isArray(secondRefOrFieldsOrBuildField)) {
    const resolveField = thirdRefOrResolveField as (resolve: FieldResolver) => FieldInfoObject;
    const fieldMap = resolveField(resolve);
    return lightModelOf(
      firstRefOrBuildField as ConstantCls,
      secondRefOrFieldsOrBuildField as unknown as readonly never[],
      fieldMap,
      ...(extendRefs as ConstantCls[]),
    );
  }

  if (
    !(secondRefOrFieldsOrBuildField as Cls).prototype ||
    !(secondRefOrFieldsOrBuildField as Cls<unknown, { modelType?: ConstantType }>).modelType
  ) {
    const buildField = secondRefOrFieldsOrBuildField as (builder: FieldBuilder) => FieldInfoObject;
    const fieldMap = buildField(field);
    if (ConstantRegistry.isScalar(firstRefOrBuildField as Cls<unknown, { modelType: ConstantType }>)) {
      if (!thirdRefOrResolveField) return objectModelOf(firstRefOrBuildField as ConstantCls, fieldMap);
      else
        return extendModelObjects(
          firstRefOrBuildField as ConstantCls,
          fieldMap,
          thirdRefOrResolveField as ConstantCls,
          ...(extendRefs as ConstantCls[]),
        );
    }
    if (ConstantRegistry.isFull(firstRefOrBuildField as Cls<unknown, { modelType: ConstantType }>)) {
      const extendInsightRefs = [
        ...(thirdRefOrResolveField ? [thirdRefOrResolveField as Cls] : []),
        ...extendRefs,
      ] as ConstantCls[];
      return extendModelInsights(fieldMap, ...extendInsightRefs);
    }
  } else {
    const objectRef = firstRefOrBuildField as ConstantCls;
    const lightRef = secondRefOrFieldsOrBuildField as ConstantCls;
    const resolveField = thirdRefOrResolveField as (resolve: FieldResolver) => FieldInfoObject;
    const fieldMap = resolveField(resolve);
    return fullModelOf(objectRef, lightRef, fieldMap, ...(extendRefs as ConstantCls[]));
  }
  throw new Error(
    `Invalid modelRef args ${firstRefOrBuildField as Cls} ${secondRefOrFieldsOrBuildField as Cls} ${extendRefs.join(", ")}`,
  );
}
