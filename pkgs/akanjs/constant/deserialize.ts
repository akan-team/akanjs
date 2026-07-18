import { Any, applyFnToArrayObjects, type Cls, FIELD_META, PrimitiveRegistry, type PrimitiveScalar } from "akanjs/base";

import { type ConstantCls, type ConstantModelRef, ConstantRegistry, type FieldProps } from ".";

const getDeserializeFn = (inputRef: ConstantModelRef | PrimitiveScalar) => {
  const deserializeFn = PrimitiveRegistry.has(inputRef as Cls)
    ? (value: unknown) => (inputRef as unknown as typeof PrimitiveScalar)._parse(value as never)
    : (value: unknown) => value as object;
  return deserializeFn;
};
const deserializeMap = (value: unknown, field: Pick<FieldProps, "of">) => {
  if (!field.of) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, val]) => [
      key,
      applyFnToArrayObjects(val, (v: never) => deserializeInput(v, field.of as ConstantModelRef, 0)),
    ]),
  );
};

const deserializeInput = <Input = unknown>(
  value: Input | Input[],
  inputRef: ConstantModelRef<Input> | PrimitiveScalar,
  arrDepth: number,
  convertFn: (value: unknown) => unknown = (value: unknown) => value,
): Input | Input[] => {
  if (arrDepth && Array.isArray(value))
    return value.map((v) => deserializeInput(v, inputRef, arrDepth - 1, convertFn) as Input) as unknown as Input[];
  else if ((inputRef as ConstantCls).prototype === Map.prototype) {
    const deserializeFn = getDeserializeFn(inputRef);
    const entries = value instanceof Map ? [...value.entries()] : Object.entries(value as Record<string, unknown>);
    const returnValue = Object.fromEntries(
      entries.map(([key, val]) => [key, applyFnToArrayObjects(val, deserializeFn)]),
    ) as unknown as Input;
    return convertFn(returnValue) as Input;
  } else if (PrimitiveRegistry.has(inputRef as Cls)) {
    const deserializeFn = getDeserializeFn(inputRef);
    const returnValue = deserializeFn(value) as Input;
    return convertFn(returnValue) as Input;
  }
  if (!ConstantRegistry.isScalar(inputRef as Cls)) {
    const returnValue = value as { id: string } as Input;
    return convertFn(returnValue) as Input;
  } else {
    const returnValue = Object.fromEntries(
      Object.entries((inputRef as ConstantCls)[FIELD_META]).map(([key, field]) => [
        key,
        field.isMap
          ? deserializeMap((value as Record<string, unknown>)[key], field.getProps())
          : deserialize(field.modelRef, field.arrDepth, (value as Record<string, unknown>)[key], {
              key,
              nullable: field.nullable,
            }),
      ]),
    ) as unknown as Input;
    return convertFn(returnValue) as Input;
  }
};

export const deserialize = (
  argRef: ConstantModelRef | PrimitiveScalar,
  arrDepth: number,
  value: unknown,
  { key, nullable = false, convertFn }: { key?: string; nullable?: boolean; convertFn?: (value: unknown) => unknown },
) => {
  if (nullable && (value === null || value === undefined)) return null;
  else if (!nullable && (value === null || value === undefined) && argRef !== Any)
    throw new Error(`Invalid Value (Nullable) in ${key} ${argRef} for value ${value}`);
  return deserializeInput(value, argRef, arrDepth, convertFn) as object[];
};
