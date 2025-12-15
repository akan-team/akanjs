/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  arraiedModel,
  type Dayjs,
  EnumInstance,
  Float,
  getNonArrayModel,
  type GqlScalar,
  ID,
  Int,
  isEnum,
  isGqlMap,
  isGqlScalar,
  JSON,
  type Type,
  type UnType,
} from "@akanjs/base";

import { constantInfo } from "./constantInfo";
import {
  ConstantFieldMeta,
  ConstantFieldProps,
  getFieldMetaMapOnPrototype,
  setFieldMetaMapOnPrototype,
} from "./scalar";

export type ParamFieldType =
  | typeof ID
  | typeof Int
  | StringConstructor
  | typeof Date
  | BooleanConstructor
  | EnumInstance<string, string>;

export type ConstantFieldType =
  | ParamFieldType
  | DateConstructor
  | typeof Float
  | typeof JSON
  | Type
  | MapConstructor
  | EnumInstance<string, number>;
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
      : Field extends typeof ID
        ? string
        : Field extends DateConstructor
          ? Dayjs
          : Field extends StringConstructor
            ? string
            : Field extends BooleanConstructor
              ? boolean
              : Field extends typeof Int
                ? number
                : Field extends typeof Float
                  ? number
                  : Field extends typeof JSON
                    ? any
                    : Field extends EnumInstance<string, infer V>
                      ? V
                      : Field extends Type
                        ? UnType<Field>
                        : never;
export interface FieldInfoObject {
  [key: string]: FieldInfo<ConstantFieldTypeInput | null, any>;
}
export type ExtractFieldInfoObject<Obj extends FieldInfoObject> = {
  [K in keyof Obj]: Obj[K] extends FieldInfo<infer F, infer E, infer M>
    ? unknown extends E
      ? FieldToValue<F, M>
      : E
    : never;
};

class FieldInfo<
  Value extends ConstantFieldTypeInput | null = null,
  ExplicitType = unknown,
  MapValue = Value extends MapConstructor ? GqlScalar : never,
> {
  private readonly value: Value;
  private readonly type: ConstantFieldTypeInput;
  private readonly option: ConstantFieldProps;
  declare explicitType: ExplicitType;
  constructor(value: Value, option: ConstantFieldProps<any, MapValue>) {
    this.value = value;
    const [singleValue, arrDepth] = getNonArrayModel(value as Type);
    const isEnumValue = isEnum(singleValue);
    const valueType = isEnumValue ? arraiedModel((singleValue as EnumInstance).type, arrDepth) : value;
    this.type = valueType as ConstantFieldTypeInput;
    this.option = { ...option, ...(isEnumValue ? { enum: singleValue } : {}) } as any;
  }
  optional() {
    return new FieldInfo(this.value as Value | null, { ...this.option, nullable: true });
  }
  meta(meta: ConstantFieldProps["meta"]) {
    this.option.meta = meta;
    return this;
  }
  applyFieldMeta(target: Type, key: string) {
    const [modelRef, arrDepth] = getNonArrayModel(this.type as Type);
    const [option, optArrDepth] = getNonArrayModel(this.option);

    const isArray = arrDepth > 0;
    const isClass = !isGqlScalar(modelRef);
    const isMap = isGqlMap(modelRef);
    if (isMap && !option.of) throw new Error("Map type must have 'of' option");
    const metadata = {
      nullable: option.nullable ?? (option.default === "" ? true : false),
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
      validate: option.validate,
      key,
      isClass,
      isScalar: constantInfo.isScalar(modelRef),
      modelRef,
      arrDepth,
      isArray,
      optArrDepth,
      isMap,
      of: option.of,
      text: option.text,
      meta: option.meta ?? {},
    };
    const metadataMap = getFieldMetaMapOnPrototype(target.prototype as object);
    metadataMap.set(key, metadata as ConstantFieldMeta);
    setFieldMetaMapOnPrototype(target.prototype as object, metadataMap);
  }
}
type FieldOption<
  Value extends ConstantFieldTypeInput,
  MapValue = Value extends MapConstructor ? GqlScalar : never,
  Metadata extends { [key: string]: any } = { [key: string]: any },
  _FieldToValue = FieldToValue<Value> | null | undefined,
> =
  | Omit<ConstantFieldProps<_FieldToValue, MapValue, Metadata>, "enum" | "meta" | "nullable" | "fieldType" | "select">
  | Omit<
      ConstantFieldProps<_FieldToValue, MapValue, Metadata>,
      "enum" | "meta" | "nullable" | "fieldType" | "select"
    >[];

export type PlainTypeToFieldType<PlainType> = PlainType extends [infer First, ...infer Rest]
  ? PlainTypeToFieldType<First>[]
  : PlainType extends number
    ? typeof Int | typeof Float
    : PlainType extends string
      ? StringConstructor
      : typeof JSON;

export const field = <
  ExplicitType,
  Value extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>,
  MapValue = Value extends MapConstructor ? GqlScalar : never,
>(
  value: Value,
  option: FieldOption<Value, MapValue> = {}
) => new FieldInfo<Value, ExplicitType, MapValue>(value, { ...option, fieldType: "property" });

field.secret = <
  ExplicitType,
  Value extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>,
  MapValue = Value extends MapConstructor ? GqlScalar : never,
>(
  value: Value,
  option: FieldOption<Value, MapValue> = {}
) =>
  new FieldInfo<Value | null, ExplicitType | null, MapValue>(value, { ...option, fieldType: "hidden", nullable: true });
field.hidden = <
  ExplicitType,
  Value extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>,
  MapValue = Value extends MapConstructor ? GqlScalar : never,
>(
  value: Value,
  option: FieldOption<Value, MapValue> = {}
) =>
  new FieldInfo<Value | null, ExplicitType | null, MapValue>(value, {
    ...option,
    fieldType: "hidden",
    select: false,
    nullable: true,
  });
export const resolve = <
  ExplicitType,
  Value extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>,
  MapValue = Value extends MapConstructor ? GqlScalar : never,
>(
  value: Value,
  option: FieldOption<Value, MapValue> = {}
) => new FieldInfo<Value, ExplicitType, MapValue>(value, { ...option, fieldType: "resolve" });
export type FieldBuilder = typeof field;
export type FieldResolver = typeof resolve;
