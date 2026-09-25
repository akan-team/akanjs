import {
  Any,
  applyFnToArrayObjects,
  type Cls,
  type Dayjs,
  dayjs,
  FIELD_META,
  type GetStateObject,
  getNonArrayModel,
  ID,
  PrimitiveRegistry,
  type PrimitiveScalar,
} from "akanjs/base";
import { Logger } from "akanjs/common";

import {
  type BaseObject,
  type ConstantModelRef,
  ConstantRegistry,
  type DefaultOf,
  type DefaultOfSchema,
  type FieldProps,
} from ".";

type Purified<O> = O extends BaseObject
  ? string
  : O extends BaseObject[]
    ? string[]
    : O extends Dayjs
      ? Dayjs
      : O extends object
        ? PurifiedModel<O>
        : O;
type PurifiedWithObjectToId<T, StateKeys extends keyof GetStateObject<T> = keyof GetStateObject<T>> = {
  [K in StateKeys as null extends T[K] ? never : K]: Purified<T[K]>;
} & {
  [K in StateKeys as null extends T[K] ? K : never]?: Purified<T[K]> | undefined;
};
export type PurifiedModel<T> = T extends (infer S)[]
  ? PurifiedModel<S>[]
  : T extends string | number | boolean | Dayjs | File
    ? T
    : T extends Map<infer K, infer V>
      ? Map<K, PurifiedModel<V>>
      : PurifiedWithObjectToId<T>;

// An `[Upload]` body purifies to `File[]`, but the browser only ever hands you a `FileList`
// (`input.files`, `dataTransfer.files`). `HttpClient.makeBody` spreads both, so declare both.
export type UploadableClientArg<T> = [T] extends [File[]] ? File[] | FileList : T;

export type PurifyFunc<Input, _DefaultInput = DefaultOf<Input>, _PurifiedInput = PurifiedModel<Input>> = (
  self: _DefaultInput,
  isChild?: boolean,
) => _PurifiedInput | null;

export type PurifyFuncV2<
  Input,
  RelationKey extends string = never,
  _DefaultInput = DefaultOfSchema<Input, RelationKey>,
  _PurifiedInput = PurifiedModel<Input>,
> = (self: _DefaultInput, isChild?: boolean) => _PurifiedInput | null;

const getPurifyFn = (modelRef: Cls): ((value: unknown) => unknown) => {
  const [valueRef] = getNonArrayModel(modelRef);
  const purifyFn = PrimitiveRegistry.has(valueRef)
    ? (value: unknown) => (valueRef as unknown as typeof PrimitiveScalar)._serialize(value as never)
    : (value: unknown) => value as object;
  return purifyFn;
};

const purify = (field: FieldProps, key: string, value: unknown, self: Record<string, unknown>): unknown => {
  // 1. Check Data Validity
  if (
    field.nullable &&
    (value === null ||
      value === undefined ||
      (typeof value === "number" && Number.isNaN(value)) ||
      (typeof value === "string" && !value.length))
  )
    return null;
  if (field.isArray) {
    if (!Array.isArray(value)) throw new Error(`Invalid Array Value in ${key} for value ${value}`);
    if (field.minlength && value.length < field.minlength)
      throw new Error(`Invalid Array Length (Min) in ${key} for value ${value}`);
    else if (field.maxlength && value.length > field.maxlength)
      throw new Error(`Invalid Array Length (Max) in ${key} for value ${value}`);
    else if (field.optArrDepth === 0 && field.validate && !field.validate(value, self))
      throw new Error(`Invalid Array Value (Failed to pass validation) in ${key} for value ${value}`);
    return value.map((v) => purify({ ...field, isArray: field.arrDepth > 1, arrDepth: field.arrDepth - 1 }, key, v, v));
  }
  if (field.isMap && field.of) {
    const purifyFn = PrimitiveRegistry.has(field.of as Cls)
      ? getPurifyFn(field.of as Cls)
      : (value: unknown) => makePurify(field.of as ConstantModelRef)(value as object);
    return Object.fromEntries(
      [...(value as Map<string, unknown>).entries()].map(([key, val]) => [key, applyFnToArrayObjects(val, purifyFn)]),
    );
  }
  if (field.isClass) return makePurify(field.modelRef)(value as object, true) as object;
  if (field.modelRef === Date && dayjs(value as Date).isBefore(dayjs(new Date("0000"))))
    throw new Error(`Invalid Date Value (Default) in ${key} for value ${value}`);
  if ([String, ID].includes(field.modelRef as unknown as StringConstructor | typeof ID) && (value === "" || !value))
    throw new Error(`Invalid String Value (Default) in ${key} for value ${value}`);
  if (field.validate && !field.validate(value, self))
    throw new Error(`Invalid Value (Failed to pass validation) / ${value} in ${key}`);
  if (!field.nullable && !value && value !== 0 && value !== false && (field.modelRef as Cls) !== Any)
    throw new Error(`Invalid Value (Nullable) in ${key} for value ${value}`);

  // 2. Convert Value
  const purifyFn = getPurifyFn(field.modelRef);
  return purifyFn(value);
};

export const makePurify = <I>(modelRef: ConstantModelRef<I>): PurifyFunc<I> => {
  const fn = ((self: Record<string, unknown>, isChild?: boolean): unknown => {
    try {
      if (isChild && !ConstantRegistry.isScalar(modelRef)) {
        const id = self.id as string;
        if (!id) throw new Error(`Invalid Value (No ID) for id ${modelRef}`);
        return id;
      }
      const result: Record<string, unknown> = {};
      Object.entries(modelRef[FIELD_META]).forEach(([key, field]) => {
        const value = self[key] as object;
        result[key] = purify(field.getProps(), key, value, self) as object;
      });
      return result;
    } catch (err) {
      if (isChild) throw new Error(err as string);
      Logger.debug(err as string);
      return null;
    }
  }) as PurifyFunc<I>;
  return fn;
};
