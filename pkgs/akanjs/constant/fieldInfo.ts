import {
  type Any,
  arraiedModel,
  CLIENT_VALUE,
  type Cls,
  type Dayjs,
  type EnumInstance,
  type Float,
  getNonArrayModel,
  ID,
  Int,
  isEnum,
  PrimitiveRegistry,
  type PrimitiveScalar,
  SERVER_VALUE,
  type SingleValue,
  type UnCls,
} from "akanjs/base";
import { ConstantRegistry } from "./constantRegistry";
import type { BaseObject } from "./types";
import type { ConstantModelRef } from "./via";

export type ParamFieldType =
  | (typeof PrimitiveScalar & {
      [CLIENT_VALUE]: string | number | boolean | Dayjs;
    })
  | EnumInstance<string, any>;

// biome-ignore lint/suspicious/noExplicitAny: enum values can be arbitrary string/number literal unions.
type ConstantFieldEnumType = EnumInstance<string, any>;
export type ConstantFieldType = typeof PrimitiveScalar | ConstantModelRef | MapConstructor | ConstantFieldEnumType;
export type ConstantFieldTypeInput =
  | ConstantFieldType
  | ConstantFieldType[]
  | ConstantFieldType[][]
  | ConstantFieldType[][][];

export type FieldToValue<Field, MapValue = any> = Field extends null
  ? FieldToValue<Exclude<Field, null>> | null
  : Field extends MapConstructor
    ? Map<string, FieldToValue<MapValue>>
    : Field extends (infer F)[]
      ? FieldToValue<F>[]
      : Field extends typeof PrimitiveScalar | StringConstructor | BooleanConstructor | DateConstructor
        ? Field[typeof SERVER_VALUE]
        : Field extends ConstantModelRef
          ? UnCls<Field>
          : Field extends { [SERVER_VALUE]: infer V }
            ? V
            : Field extends Cls
              ? UnCls<Field>
              : never;
export interface FieldInfoObject {
  [key: string]: FieldInfo<
    any,
    ConstantFieldTypeInput | null,
    any,
    any,
    any,
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
    boolean
  >;
}
export type ExtractFieldInfoObject<Obj extends FieldInfoObject> = {
  [K in keyof Obj]: unknown extends Obj[K]["explicitType"]
    ? FieldToValue<Obj[K]["value"], Obj[K]["mapValue"]>
    : Obj[K]["explicitType"];
};
type FieldKindSource<Value> = NonNullable<SingleValue<Value>>;
type IsNullableValue<Value> = null extends Value ? true : false;
type FieldInfoValue<Value, ExplicitType, MapValue> = unknown extends ExplicitType
  ? FieldToValue<Value, MapValue>
  : ExplicitType;

export type ConstantFieldKind = "property" | "hidden" | "secret" | "resolve";

export interface ConstantFieldProps<
  FieldType extends ConstantFieldKind = ConstantFieldKind,
  FieldValue = any,
  MapValue = any,
  Metadata = { [key: string]: any },
> {
  nullable?: boolean;
  ref?: string;
  refPath?: string;
  refType?: "child" | "parent" | "relation";
  default?: FieldValue | ((doc: { id: string }) => FieldValue);
  type?: FieldPreset;
  fieldType?: FieldType;
  immutable?: boolean;
  min?: number;
  max?: number;
  enum?: EnumInstance;
  select?: boolean;
  minlength?: number;
  maxlength?: number;
  accumulate?: any;
  example?: FieldValue;
  of?: MapValue; // for Map type fields
  validate?: (value: FieldValue, model: any) => boolean;
  text?: "search" | "filter";
  meta?: Metadata;
}
export const fieldPresets = ["email", "password", "url"] as const;
export type FieldPreset = (typeof fieldPresets)[number];

class FieldInfo<
  FieldType extends ConstantFieldKind = any,
  Value extends ConstantFieldTypeInput | null = null,
  ExplicitType = unknown,
  MapValue = Value extends MapConstructor ? typeof PrimitiveScalar : never,
  KindSource = FieldKindSource<Value>,
  IsRelation extends boolean = UnCls<KindSource> extends BaseObject ? true : false,
  IsEnum extends boolean = KindSource extends EnumInstance<string, any> ? true : false,
  IsPrimitive extends boolean = KindSource extends typeof PrimitiveScalar ? true : false,
  IsMap extends boolean = KindSource extends MapConstructor ? true : false,
  IsScalar extends boolean = IsRelation extends true
    ? false
    : IsEnum extends true
      ? false
      : IsPrimitive extends true
        ? false
        : IsMap extends true
          ? false
          : true,
  IsHidden extends boolean = FieldType extends "hidden" ? true : false,
  IsSecret extends boolean = FieldType extends "secret" ? true : false,
> {
  readonly value: Value;
  readonly type: ConstantFieldTypeInput;
  readonly option: ConstantFieldProps;
  declare explicitType: ExplicitType;
  declare mapValue: MapValue;
  declare _isEnum: IsEnum;
  declare _isPrimitive: IsPrimitive;
  declare _isScalar: IsScalar;
  declare _isRelation: IsRelation;
  declare _isHidden: IsHidden;
  declare _isSecret: IsSecret;
  declare _isMap: IsMap;

  constructor(value: Value, option: ConstantFieldProps<FieldType, any, MapValue>) {
    this.value = value;
    const [singleValue, arrDepth] = getNonArrayModel(value as Cls);
    const isEnumValue = isEnum(singleValue);
    const valueType = isEnumValue ? arraiedModel((singleValue as EnumInstance).type, arrDepth) : value;
    this.type = valueType as ConstantFieldTypeInput;
    this.option = {
      ...option,
      ...(isEnumValue ? { enum: singleValue } : {}),
    } as any;
  }
  optional() {
    this.option.nullable = true;
    return this as FieldInfo<FieldType, Value | null, ExplicitType | null, MapValue>;
  }
  meta(meta: ConstantFieldProps["meta"]) {
    this.option.meta = meta;
    return this;
  }
  toField() {
    return ConstantField.fromFieldInfo(this);
  }
}

interface ConstantFieldBuildProps<
  FieldType extends ConstantFieldKind = any,
  FieldValue = any,
  MapValue = any,
  Metadata = any,
  Nullable extends boolean = boolean,
> {
  nullable: Nullable;
  ref?: string;
  refPath?: string;
  refType?: "child" | "parent" | "relation";
  default: FieldValue | ((doc: { id: string }) => FieldValue);
  type?: FieldPreset;
  fieldType: FieldType;
  immutable: boolean;
  min?: number;
  max?: number;
  enum?: EnumInstance;
  select: boolean;
  minlength?: number;
  maxlength?: number;
  accumulate?: any;
  example?: FieldValue;
  of?: MapValue; // for Map type fields
  validate?: (value: FieldValue, model: any) => boolean;
  text?: "search" | "filter";
  modelRef: ConstantModelRef;
  arrDepth: number;
  optArrDepth: number;
  meta: Metadata;
}

export interface FieldProps extends ConstantFieldBuildProps {
  isClass: boolean;
  isScalar: boolean;
  isArray: boolean;
  isMap: boolean;
}

type ConstantFieldFromInfoParts<
  FieldType extends ConstantFieldKind,
  Value extends ConstantFieldTypeInput | null,
  ExplicitType,
  MapValue,
  IsRelation extends boolean,
  IsEnum extends boolean,
  IsPrimitive extends boolean,
  IsMap extends boolean,
  IsScalar extends boolean,
  IsHidden extends boolean,
  IsSecret extends boolean,
  _FieldValue = FieldInfoValue<Value, ExplicitType, MapValue>,
> = ConstantField<
  FieldType,
  Value,
  _FieldValue,
  MapValue,
  IsNullableValue<_FieldValue>,
  IsRelation,
  IsEnum,
  IsPrimitive,
  IsScalar,
  IsHidden,
  IsSecret,
  IsMap
>;
type ConstantFieldFromInfo<Info> =
  Info extends FieldInfo<
    infer FieldType,
    infer Value,
    infer ExplicitType,
    infer MapValue,
    infer _KindSource,
    infer IsRelation,
    infer IsEnum,
    infer IsPrimitive,
    infer IsMap,
    infer IsScalar,
    infer IsHidden,
    infer IsSecret
  >
    ? ConstantFieldFromInfoParts<
        FieldType,
        Value,
        ExplicitType,
        MapValue,
        IsRelation,
        IsEnum,
        IsPrimitive,
        IsMap,
        IsScalar,
        IsHidden,
        IsSecret
      >
    : never;

export type FieldInfoObjectToFieldObject<Obj extends FieldInfoObject> = {
  [K in keyof Obj]: ConstantFieldFromInfo<Obj[K]>;
};

/** Runtime metadata for a single Akan constant field. */
export class ConstantField<
  FieldType extends ConstantFieldKind = ConstantFieldKind,
  Value extends ConstantFieldTypeInput | null = any,
  FieldValue = any,
  MapValue = any,
  Nullable extends boolean = boolean,
  IsRelation extends boolean = boolean,
  IsEnum extends boolean = boolean,
  IsPrimitive extends boolean = boolean,
  IsScalar extends boolean = boolean,
  IsHidden extends boolean = boolean,
  IsSecret extends boolean = boolean,
  IsMap extends boolean = boolean,
  Metadata = { [key: string]: any },
> implements ConstantFieldBuildProps<FieldType, FieldValue, MapValue, Metadata>
{
  static getBaseModelField(): FieldObject {
    return {
      id: field(ID).toField(),
      createdAt: field(Date).toField(),
      updatedAt: field(Date).toField(),
      removedAt: field(Date).optional().toField(),
    };
  }
  static getBaseInsightField(): FieldObject {
    return {
      count: field(Int, { default: 0, accumulate: {} }).toField(),
    };
  }
  readonly nullable: Nullable;
  readonly ref?: string;
  readonly refPath?: string;
  readonly refType?: "child" | "parent" | "relation";
  readonly default: FieldValue | ((doc: { id: string }) => FieldValue);
  readonly type?: FieldPreset;
  readonly fieldType: FieldType;
  readonly immutable: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly enum?: EnumInstance;
  readonly select: boolean;
  readonly minlength?: number;
  readonly maxlength?: number;
  readonly accumulate?: any;
  readonly example?: FieldValue;
  readonly of?: MapValue; // for Map type fields
  readonly validate?: (value: FieldValue, model: any) => boolean;
  readonly text?: "search" | "filter";
  readonly modelRef: ConstantModelRef;
  readonly arrDepth: number;
  readonly optArrDepth: number;
  readonly meta: Metadata;
  declare _isScalar: IsScalar;
  declare _isRelation: IsRelation;
  declare _isEnum: IsEnum;
  declare _isPrimitive: IsPrimitive;
  declare _isHidden: IsHidden;
  declare _isSecret: IsSecret;
  declare _isMap: IsMap;
  constructor(props: ConstantFieldBuildProps<FieldType, FieldValue, MapValue, Metadata>) {
    this.nullable = props.nullable as unknown as Nullable;
    this.ref = props.ref;
    this.refPath = props.refPath;
    this.refType = props.refType;
    this.default = props.default;
    this.type = props.type;
    this.fieldType = props.fieldType;
    this.immutable = props.immutable;
    this.min = props.min;
    this.max = props.max;
    this.enum = props.enum;
    this.select = props.select;
    this.minlength = props.minlength;
    this.maxlength = props.maxlength;
    this.accumulate = props.accumulate;
    this.example = props.example;
    this.of = props.of;
    this.validate = props.validate;
    this.text = props.text;
    this.modelRef = props.modelRef;
    this.arrDepth = props.arrDepth;
    this.optArrDepth = props.optArrDepth;
    this.meta = props.meta;
  }

  static fromFieldInfo<
    FieldType extends ConstantFieldKind = any,
    Value extends ConstantFieldTypeInput | null = null,
    FieldValue = any,
    MapValue = any,
    Nullable extends boolean = IsNullableValue<FieldInfoValue<Value, FieldValue, MapValue>>,
    KindSource = FieldKindSource<Value>,
    IsRelation extends boolean = false,
    IsEnum extends boolean = false,
    IsPrimitive extends boolean = false,
    IsMap extends boolean = false,
    IsScalar extends boolean = false,
    IsHidden extends boolean = false,
    IsSecret extends boolean = false,
    Metadata = { [key: string]: any },
  >(
    fieldInfo: FieldInfo<
      FieldType,
      Value,
      FieldValue,
      MapValue,
      KindSource,
      IsRelation,
      IsEnum,
      IsPrimitive,
      IsMap,
      IsScalar,
      IsHidden,
      IsSecret
    >,
  ): ConstantField<
    FieldType,
    Value,
    FieldValue,
    MapValue,
    Nullable,
    IsRelation,
    IsEnum,
    IsPrimitive,
    IsScalar,
    IsHidden,
    IsSecret,
    IsMap,
    Metadata
  > {
    const [modelRef, arrDepth] = getNonArrayModel(fieldInfo.type as Cls);
    const [option, optArrDepth] = getNonArrayModel(fieldInfo.option);

    const isArray = arrDepth > 0;
    const isMap = modelRef === Map;
    if (isMap && !option.of) throw new Error("Map type must have 'of' option");

    return new ConstantField({
      nullable: option.nullable ?? ((option.default === "") as unknown as Nullable),
      ref: option.ref,
      refPath: option.refPath,
      refType: option.refType,
      default: option.default ?? (isArray ? [] : null),
      type: option.type,
      fieldType: option.fieldType ?? "property",
      immutable: option.immutable ?? false,
      min: option.min,
      max: option.max,
      enum: option.enum,
      select: option.select ?? true,
      minlength: option.minlength,
      maxlength: option.maxlength,
      accumulate: option.accumulate,
      example: option.example,
      of: option.of,
      validate: option.validate,
      text: option.text,
      modelRef,
      arrDepth: arrDepth,
      optArrDepth: optArrDepth,
      meta: (option.meta ?? {}) as Metadata,
    } as ConstantFieldBuildProps<FieldType, FieldValue, MapValue, Metadata, Nullable>);
  }
  get isClass() {
    return !PrimitiveRegistry.has(this.modelRef) && !this.isMap;
  }
  get isScalar() {
    return ConstantRegistry.isScalar(this.modelRef) || PrimitiveRegistry.has(this.modelRef);
  }
  get isArray() {
    return this.arrDepth > 0;
  }
  get isMap() {
    return (this.modelRef as Cls) === Map;
  }
  getProps(): FieldProps {
    return {
      nullable: this.nullable as unknown as boolean,
      ref: this.ref,
      refPath: this.refPath,
      refType: this.refType,
      default: this.default,
      type: this.type,
      fieldType: this.fieldType,
      immutable: this.immutable,
      min: this.min,
      max: this.max,
      enum: this.enum,
      select: this.select,
      minlength: this.minlength,
      maxlength: this.maxlength,
      accumulate: this.accumulate,
      example: this.example,
      of: this.of,
      validate: this.validate,
      text: this.text,
      modelRef: this.modelRef,
      arrDepth: this.arrDepth,
      optArrDepth: this.optArrDepth,
      meta: this.meta,
      isClass: this.isClass,
      isScalar: this.isScalar,
      isArray: this.isArray,
      isMap: this.isMap,
    };
  }
}
export interface FieldObject {
  [key: string]: ConstantField;
}

type FieldOption<
  Value extends ConstantFieldTypeInput,
  MapValue = Value extends MapConstructor ? typeof PrimitiveScalar : never,
  Metadata extends { [key: string]: any } = { [key: string]: any },
  _FieldToValue = FieldToValue<Value, MapValue> | null | undefined,
> =
  | Omit<
      ConstantFieldProps<ConstantFieldKind, _FieldToValue, MapValue, Metadata>,
      "enum" | "meta" | "nullable" | "fieldType" | "select"
    >
  | Omit<
      ConstantFieldProps<ConstantFieldKind, SingleValue<_FieldToValue>, MapValue, Metadata>,
      "enum" | "meta" | "nullable" | "fieldType" | "select"
    >[];

export type PlainTypeToFieldType<PlainType> = PlainType extends [infer First, ...infer Rest]
  ? PlainTypeToFieldType<First>[]
  : PlainType extends number
    ? typeof Int | typeof Float
    : PlainType extends string
      ? StringConstructor
      : typeof Any;

/** Builds a stored property field with optional validation, default, ref, text, and metadata options. */
export const field = <
  ExplicitType,
  Value extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>,
  MapValue = Value extends MapConstructor ? typeof PrimitiveScalar : never,
>(
  value: Value,
  option: FieldOption<Value, MapValue> = {},
) =>
  new FieldInfo<"property", Value, ExplicitType, MapValue>(value, {
    ...option,
    fieldType: "property",
  });

field.hidden = <
  ExplicitType,
  Value extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>,
  MapValue = Value extends MapConstructor ? typeof PrimitiveScalar : never,
>(
  value: Value,
  option: FieldOption<Value, MapValue> = {},
) =>
  new FieldInfo<"hidden", Value, ExplicitType, MapValue>(value, {
    ...option,
    fieldType: "hidden",
    nullable: true,
  });
field.secret = <
  ExplicitType,
  Value extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>,
  MapValue = Value extends MapConstructor ? typeof PrimitiveScalar : never,
>(
  value: Value,
  option: FieldOption<Value, MapValue> = {},
) =>
  new FieldInfo<"secret", Value | null, ExplicitType | null, MapValue>(value, {
    ...option,
    fieldType: "secret",
    select: false,
    nullable: true,
  });
/** Builds a resolved field that is derived rather than treated as a stored property. */
export const resolve = <
  ExplicitType,
  Value extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>,
  MapValue = Value extends MapConstructor ? typeof PrimitiveScalar : never,
>(
  value: Value,
  option: FieldOption<Value, MapValue> = {},
) =>
  new FieldInfo<"resolve", Value, ExplicitType, MapValue>(value, {
    ...option,
    fieldType: "resolve",
  });
export type FieldBuilder = typeof field;
export type FieldResolver = typeof resolve;
