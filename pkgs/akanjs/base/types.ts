import type { Dayjs } from "dayjs";

export type SshOptions = { host: string; port: number; username: string; password: string; dstPort?: number };

export type Cls<T = unknown, Statics = unknown> = (new (...args: never[]) => T) & Statics;

export type BufferLike =
  | string
  | Buffer
  | DataView
  | number
  | ArrayBufferView
  | Uint8Array
  | ArrayBuffer
  | SharedArrayBuffer
  | readonly unknown[]
  | readonly number[];

export type GetObject<T> = {
  [K in keyof T as K extends "prototype" ? never : K]: T[K];
};
export type OptionOf<Obj> = Partial<{
  [K in keyof Obj]: Obj[K] | null;
}>;
export type UnCls<T> = T extends new (...args: infer _Args) => infer U ? U : never;

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type GetStateObject<T> = {
  [K in keyof T as T[K] extends (...args: never[]) => unknown ? never : K extends "prototype" ? never : K]: T[K];
};
export type GetActionObject<T> = {
  [K in keyof T as T[K] extends (...args: never[]) => unknown ? (K extends "prototype" ? never : K) : never]: T[K];
};

export type PromiseOrObject<T> = T | Promise<T>;
type MergeObjectValues<T> = T extends Record<string, infer V> ? (V extends object ? V : never) : never;
type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
export type MergedValues<T> = UnionToIntersection<MergeObjectValues<T>>;
export type Assign<A, B> = Omit<A, keyof B> & B;

// NOTE: All `MergeAll*` utilities below use accumulator-style tail recursion so that
// TS does not allocate a new intersection node at every frame of the recursion. This
// keeps type-checking roughly linear (vs. quadratic for the naive `T & Recurse<Rest>`).
export type ObjectAssign<Objects extends object[], Acc = unknown> = Objects extends [
  infer First extends object,
  ...infer Rest extends object[],
]
  ? ObjectAssign<Rest, Assign<Acc, First>>
  : Acc;

export type ObjectAssignKeyOfObjects<
  T extends object[],
  Key extends PropertyKey,
  Acc = Record<never, never>,
> = T extends [infer First extends object, ...infer Rest extends object[]]
  ? Key extends keyof First
    ? First[Key] extends object
      ? ObjectAssignKeyOfObjects<Rest, Key, Assign<Acc, First[Key]>>
      : ObjectAssignKeyOfObjects<Rest, Key, Acc>
    : ObjectAssignKeyOfObjects<Rest, Key, Acc>
  : Acc;

export type MergeAll<T extends object[], Acc = unknown> = T extends [
  infer First extends object,
  ...infer Rest extends object[],
]
  ? MergeAll<Rest, Acc & First>
  : Acc;

export type MergeAllActionTypes<T extends Cls[], OmitKey extends string = never, Acc = unknown> = T extends [
  infer First extends Cls,
  ...infer Rest extends Cls[],
]
  ? Rest extends []
    ? Acc & Omit<GetActionObject<UnCls<First>>, OmitKey>
    : MergeAllActionTypes<Rest, OmitKey, Acc & Omit<UnCls<First>, OmitKey>>
  : Acc;

export type MergeAllTypes<T extends Cls[], OmitKey extends string = never, Acc = unknown> = T extends [
  infer First extends Cls,
  ...infer Rest extends Cls[],
]
  ? MergeAllTypes<Rest, OmitKey, Acc & Omit<UnCls<First>, OmitKey>>
  : Acc;

export type MergeAllKeyOfTypes<T extends Cls<object>[], Key extends PropertyKey, Acc = unknown> = T extends [
  infer First extends Cls<object>,
  ...infer Rest extends Cls<object>[],
]
  ? Key extends keyof UnCls<First>
    ? MergeAllKeyOfTypes<Rest, Key, Acc & UnCls<First>[Key]>
    : MergeAllKeyOfTypes<Rest, Key, Acc>
  : Acc;

export type MergeAllKeyOfObjects<T extends object[], Key extends PropertyKey, Acc = unknown> = T extends [
  infer First extends object,
  ...infer Rest extends object[],
]
  ? Key extends keyof First
    ? MergeAllKeyOfObjects<Rest, Key, Acc & First[Key]>
    : MergeAllKeyOfObjects<Rest, Key, Acc>
  : Acc;

export type MergeAllDoubleKeyOfObjects<
  T extends object[],
  Key extends PropertyKey,
  SubKey extends PropertyKey,
  Acc = unknown,
> = T extends [infer First extends object, ...infer Rest extends object[]]
  ? Key extends keyof First
    ? First[Key] extends object
      ? SubKey extends keyof First[Key]
        ? MergeAllDoubleKeyOfObjects<Rest, Key, SubKey, Acc & First[Key][SubKey]>
        : MergeAllDoubleKeyOfObjects<Rest, Key, SubKey, Acc>
      : MergeAllDoubleKeyOfObjects<Rest, Key, SubKey, Acc>
    : MergeAllDoubleKeyOfObjects<Rest, Key, SubKey, Acc>
  : Acc;

export type Primitive = string | number | boolean | null | undefined; // | symbol | bigint;

export type NestedKeysWithAllowed<T, Allowed = Primitive> = T extends Primitive
  ? never
  : T extends unknown[]
    ? never
    : T extends (...args: never[]) => unknown
      ? never
      : {
          [K in keyof T & string]: T[K] extends Allowed
            ? K
            : T[K] extends Dayjs
              ? never
              : T[K] extends readonly unknown[]
                ? never
                : T[K] extends (...args: never[]) => unknown
                  ? never
                  : T[K] extends object
                    ? K | `${K}.${NestedKeysWithAllowed<T[K], Allowed>}`
                    : never;
        }[keyof T & string];

export type SingleValue<Value> = Value extends (infer V)[] ? SingleValue<V> : Value;

export type StrArrToObject<Arr, Value> = Arr extends [infer First, ...infer Rest]
  ? { [K in First & string]: Value } & StrArrToObject<Rest, Value>
  : unknown;

export type GetValueOfKey<Model, Key extends string, Fallback = never> = Model extends { [key in Key]: unknown }
  ? Model[Key]
  : Fallback;
