import {
  applyFnToArrayObjects,
  BaseObject,
  Dayjs,
  dayjs,
  Float,
  getNonArrayModel,
  GetStateObject,
  GqlScalar,
  ID,
  Int,
  JSON as GqlJSON,
  Type,
  Upload,
} from "@akanjs/base";
import { Logger } from "@akanjs/common";

import { ConstantFieldMeta, constantInfo, DefaultOf, getFieldMetas } from ".";

class PurifyStorage {}

type Purified<O> = O extends BaseObject
  ? string
  : O extends BaseObject[]
    ? string[]
    : O extends Dayjs
      ? Dayjs
      : O extends { [key: string]: any }
        ? PurifiedModel<O>
        : O;
type PurifiedWithObjectToId<T, StateKeys extends keyof GetStateObject<T> = keyof GetStateObject<T>> = {
  [K in StateKeys]: Purified<T[K]>;
};
export type PurifiedModel<T> = T extends Upload[]
  ? FileList
  : T extends (infer S)[]
    ? PurifiedModel<S>[]
    : T extends string | number | boolean | Dayjs
      ? T
      : T extends Map<infer K, infer V>
        ? Map<K, PurifiedModel<V>>
        : PurifiedWithObjectToId<T>;

export type PurifyFunc<Input, _DefaultInput = DefaultOf<Input>, _PurifiedInput = PurifiedModel<Input>> = (
  self: _DefaultInput,
  isChild?: boolean
) => _PurifiedInput | null;

const scalarPurifyMap = new Map<GqlScalar, (value: any) => any>([
  [Date, (value: Date | Dayjs) => dayjs(value).toDate()],
  [String, (value: string) => value],
  [ID, (value: string) => value],
  [Boolean, (value: boolean) => value],
  [Int, (value: number) => value],
  [Float, (value: number) => value],
  [GqlJSON, (value: object) => value],
]);
const getPurifyFn = (modelRef: Type): ((value: any) => object) => {
  const [valueRef] = getNonArrayModel(modelRef);
  return scalarPurifyMap.get(valueRef) ?? ((value) => value as object);
};

const purify = (metadata: ConstantFieldMeta, value: any, self: any): any => {
  // 1. Check Data Validity
  if (
    metadata.nullable &&
    (value === null ||
      value === undefined ||
      (typeof value === "number" && isNaN(value)) ||
      (typeof value === "string" && !value.length))
  )
    return null;
  if (metadata.isArray) {
    if (!Array.isArray(value)) throw new Error(`Invalid Array Value in ${metadata.key} for value ${value}`);
    if (metadata.minlength && value.length < metadata.minlength)
      throw new Error(`Invalid Array Length (Min) in ${metadata.key} for value ${value}`);
    else if (metadata.maxlength && value.length > metadata.maxlength)
      throw new Error(`Invalid Array Length (Max) in ${metadata.key} for value ${value}`);
    else if (metadata.optArrDepth === 0 && metadata.validate && !metadata.validate(value, self))
      throw new Error(`Invalid Array Value (Failed to pass validation) in ${metadata.key} for value ${value}`);
    return value.map((v) => purify({ ...metadata, isArray: false }, v, v) as object) as object;
  }
  if (metadata.isMap && metadata.of) {
    const purifyFn = getPurifyFn(metadata.of as Type);
    return Object.fromEntries(
      [...(value as Map<string, any>).entries()].map(([key, val]) => [key, applyFnToArrayObjects(val, purifyFn)])
    );
  }
  if (metadata.isClass) return makePurify(metadata.modelRef)(value as object, true) as object;
  if (metadata.modelRef === Date && dayjs(value as Date).isBefore(dayjs(new Date("0000"))))
    throw new Error(`Invalid Date Value (Default) in ${metadata.key} for value ${value}`);
  if ([String, ID].includes(metadata.modelRef) && (value === "" || !value))
    throw new Error(`Invalid String Value (Default) in ${metadata.key} for value ${value}`);
  if (metadata.validate && !metadata.validate(value, self))
    throw new Error(`Invalid Value (Failed to pass validation) / ${value} in ${metadata.key}`);
  if (!metadata.nullable && !value && value !== 0 && value !== false)
    throw new Error(`Invalid Value (Nullable) in ${metadata.key} for value ${value}`);

  // 2. Convert Value
  const purifyFn = getPurifyFn(metadata.modelRef);
  return purifyFn(value);
};

const getPredefinedPurifyFn = (refName: string) => {
  const purify = Reflect.getMetadata(refName, PurifyStorage.prototype) as PurifyFunc<any, any> | undefined;
  return purify;
};
const setPredefinedPurifyFn = (refName: string, purify: PurifyFunc<any, any>) => {
  Reflect.defineMetadata(refName, purify, PurifyStorage.prototype);
};

export const makePurify = <I>(modelRef: Type<I>, option: { overwrite?: any } = {}): PurifyFunc<I> => {
  const refName = constantInfo.getRefName(modelRef);
  const purifyFn = getPredefinedPurifyFn(refName);

  if (purifyFn && !option.overwrite) return purifyFn;
  const metadatas = getFieldMetas(modelRef);
  const fn = ((self: { [key: string]: any }, isChild?: boolean): any => {
    try {
      if (isChild && !constantInfo.isScalar(modelRef)) {
        const id = self.id as string;
        if (!id) throw new Error(`Invalid Value (No ID) for id ${refName}`);
        return id;
      }
      const result: { [key: string]: any } = {};
      for (const metadata of metadatas) {
        // if (metadata.fieldType === "hidden") continue;
        const value = self[metadata.key] as object;
        result[metadata.key] = purify(metadata, value, self) as object;
      }
      return result;
    } catch (err) {
      if (isChild) throw new Error(err as string);
      Logger.debug(err as string);
      return null;
    }
  }) as PurifyFunc<I>;
  setPredefinedPurifyFn(refName, fn);
  return fn;
};
