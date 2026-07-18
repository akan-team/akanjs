import {
  Any,
  applyFnToArrayObjects,
  type Cls,
  type Dayjs,
  FIELD_META,
  getNonArrayModel,
  ID,
  PrimitiveRegistry,
  type PrimitiveScalar,
} from "akanjs/base";

import type { ConstantCls, ConstantModelRef } from ".";

export type Serialized<O> = O extends (infer V)[]
  ? Serialized<V>[]
  : O extends Dayjs
    ? Date
    : O extends Map<infer K, infer V>
      ? { [key in K & string]: Serialized<V> }
      : O extends object
        ? { [K in keyof O]: Serialized<O[K]> }
        : O;

const getSerializeFn = (inputRef: Cls, { optional = false }: { optional?: boolean } = {}) => {
  const serializeFn = PrimitiveRegistry.has(inputRef)
    ? (value: unknown) => (inputRef as typeof PrimitiveScalar)._serialize(value as never, { optional })
    : (value: unknown) => value as object;
  return serializeFn;
};
const serializeInput = <Input = unknown>(
  value: Input | Input[],
  inputRef: ConstantModelRef<Input> | PrimitiveScalar,
  arrDepth: number,
  serializeType: "input" | "object" = "object",
  { optional = false }: { optional?: boolean } = {},
): Input | Input[] => {
  if (arrDepth && Array.isArray(value))
    return value.map((v) => serializeInput(v, inputRef, arrDepth - 1, serializeType) as Input) as unknown as Input[];
  else if ((inputRef as MapConstructor).prototype === Map.prototype) {
    const [valueRef] = getNonArrayModel(inputRef as Cls);
    const serializeFn = getSerializeFn(valueRef, { optional });
    return Object.fromEntries(
      [...(value as Map<string, unknown>).entries()].map(([key, val]) => [
        key,
        applyFnToArrayObjects(val, serializeFn),
      ]),
    ) as unknown as Input;
  } else if (PrimitiveRegistry.has(inputRef as Cls)) {
    const serializeFn = getSerializeFn(inputRef as Cls, { optional });
    return serializeFn(value) as Input;
  } else {
    const modelRef = inputRef as ConstantCls;
    return Object.fromEntries(
      Object.entries(modelRef[FIELD_META]).map(([key, field]) => [
        key,
        serializeType === "input" && field.isClass && !field.isScalar
          ? serialize(ID, field.arrDepth, getRelationId((value as Record<string, unknown>)?.[key]), serializeType, {
              nullable: field.nullable,
              key,
            })
          : serialize(field.modelRef, field.arrDepth, (value as Record<string, unknown>)?.[key], serializeType, {
              nullable: field.nullable,
              key,
            }),
      ]),
    ) as unknown as Input;
  }
};

const getRelationId = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((item) => getRelationId(item));
  if (value && typeof value === "object" && "id" in value) return (value as { id: unknown }).id;
  return value;
};

export const serialize = (
  argRef: ConstantModelRef | PrimitiveScalar,
  arrDepth: number,
  value: unknown,
  serializeType: "input" | "object" = "object",
  { nullable = false, key }: { nullable?: boolean; key?: string },
) => {
  if (nullable && (value === null || value === undefined)) return null;
  else if (!nullable && (value === null || value === undefined) && argRef !== Any)
    throw new Error(`Invalid Value (Nullable) in ${argRef} for value ${value}${key ? ` in ${key}` : ""}`);
  return serializeInput(value, argRef, arrDepth, serializeType, { optional: nullable }) as object[];
};
