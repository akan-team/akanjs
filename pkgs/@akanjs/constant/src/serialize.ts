import {
  applyFnToArrayObjects,
  Dayjs,
  dayjs,
  Float,
  getNonArrayModel,
  GqlScalar,
  ID,
  Int,
  isGqlScalar,
  JSON as GqlJSON,
  Type,
} from "@akanjs/base";

import { constantInfo, getFieldMetas } from ".";

const scalarSerializeMap = new Map<GqlScalar, (value: any) => any>([
  [Date, (value: Date | Dayjs) => dayjs(value).toDate()],
  [String, (value: string) => value],
  [ID, (value: string) => value],
  [Boolean, (value: boolean) => value],
  [Int, (value: number) => value],
  [Float, (value: number) => value],
  [GqlJSON, (value: any) => value as object],
]);
const getSerializeFn = (inputRef: Type) => {
  const serializeFn = scalarSerializeMap.get(inputRef);
  if (!serializeFn) return (value: any) => value as object;
  else return serializeFn;
};
const serializeInput = <Input = any>(
  value: Input | Input[],
  inputRef: Type<Input>,
  arrDepth: number
): Input | Input[] => {
  if (arrDepth && Array.isArray(value))
    return value.map((v) => serializeInput(v, inputRef, arrDepth - 1) as Input) as unknown as Input[];
  else if (inputRef.prototype === Map.prototype) {
    const [valueRef] = getNonArrayModel(inputRef);
    const serializeFn = getSerializeFn(valueRef);
    return Object.fromEntries(
      [...(value as Map<string, any>).entries()].map(([key, val]) => [key, applyFnToArrayObjects(val, serializeFn)])
    ) as unknown as Input;
  } else if (isGqlScalar(inputRef)) {
    const serializeFn = getSerializeFn(inputRef);
    return serializeFn(value) as Input;
  }
  if (!constantInfo.isScalar(inputRef))
    return value as { id: string } as Input; // id string
  else
    return Object.fromEntries(
      getFieldMetas(inputRef).map((fieldMeta) => [
        fieldMeta.key,
        serializeInput((value as { [key: string]: any })[fieldMeta.key], fieldMeta.modelRef, fieldMeta.arrDepth),
      ])
    ) as unknown as Input;
};

export const serializeArg = (
  argRef: Type,
  arrDepth: number,
  value: any,
  { nullable = false }: { nullable?: boolean }
) => {
  if (nullable && (value === null || value === undefined)) return null;
  else if (!nullable && (value === null || value === undefined))
    throw new Error(`Invalid Value (Nullable) in ${argRef} for value ${value}`);
  return serializeInput(value, argRef, arrDepth) as object[];
};

const scalarDeserializeMap = new Map<GqlScalar, (value: any) => any>([
  [Date, (value: Date | Dayjs) => dayjs(value)],
  [String, (value: string) => value],
  [ID, (value: string) => value],
  [Boolean, (value: boolean) => value],
  [Int, (value: number) => value],
  [Float, (value: number) => value],
  [GqlJSON, (value: any) => value as object],
]);
const getDeserializeFn = (inputRef: Type) => {
  const deserializeFn = scalarDeserializeMap.get(inputRef);
  if (!deserializeFn) return (value: any) => value as object;
  return deserializeFn;
};
const deserializeInput = <Input = any>(
  value: Input | Input[],
  inputRef: Type<Input>,
  arrDepth: number
): Input | Input[] => {
  if (arrDepth && Array.isArray(value))
    return value.map((v) => deserializeInput(v, inputRef, arrDepth - 1) as Input) as unknown as Input[];
  else if (inputRef.prototype === Map.prototype) {
    const [valueRef] = getNonArrayModel(inputRef);
    const deserializeFn = getDeserializeFn(valueRef);
    return Object.fromEntries(
      [...(value as Map<string, any>).entries()].map(([key, val]) => [key, applyFnToArrayObjects(val, deserializeFn)])
    ) as unknown as Input;
  } else if (isGqlScalar(inputRef)) {
    const deserializeFn = getDeserializeFn(inputRef);
    return deserializeFn(value) as Input;
  }
  if (!constantInfo.isScalar(inputRef)) return value as { id: string } as Input;
  else
    return Object.fromEntries(
      getFieldMetas(inputRef).map((fieldMeta) => [
        fieldMeta.key,
        deserializeInput((value as { [key: string]: any })[fieldMeta.key], fieldMeta.modelRef, fieldMeta.arrDepth),
      ])
    ) as unknown as Input;
};

export const deserializeArg = (
  argRef: Type,
  arrDepth: number,
  value: any,
  { nullable = false }: { nullable?: boolean }
) => {
  if (nullable && (value === null || value === undefined)) return null;
  else if (!nullable && (value === null || value === undefined))
    throw new Error(`Invalid Value (Nullable) in ${argRef} for value ${value}`);
  return deserializeInput(value, argRef, arrDepth) as object[];
};
