import type { Dayjs } from "dayjs";

export type { SshOptions } from "tunnel-ssh";
export type Type<T = any, Statics = unknown> = (new (...args: any[]) => T) & Statics;

export type BufferLike =
  | string
  | Buffer
  | DataView
  | number
  | ArrayBufferView
  | Uint8Array
  | ArrayBuffer
  | SharedArrayBuffer
  | readonly any[]
  | readonly number[];

export type GetObject<T> = { [K in keyof T as K extends "prototype" ? never : K]: T[K] };
export type OptionOf<Obj> = Partial<{
  [K in keyof Obj]: Obj[K] | null;
}>;
export type UnType<T> = T extends new (...args: any) => infer U ? U : never;

export interface GraphQLUpload {
  name: string;
  description: string;
  specifiedByUrl: string;
  serialize: any;
  parseValue: any;
  parseLiteral: any;
  extensions: any;
  astNode: any;
  extensionASTNodes: any;
  toConfig(): any;
  toString(): string;
  toJSON(): string;
  inspect(): string;
}
export interface GraphQLJSON<TInternal = unknown, TExternal = TInternal> {
  name: string;
  description: string;
  specifiedByURL: string;
  serialize: any;
  parseValue: any;
  parseLiteral: any;
  extensions: any;
  astNode: any;
  extensionASTNodes: any;
  get [Symbol.toStringTag](): string;
  toConfig(): any;
  toString(): string;
  toJSON(): string;
}

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type GetStateObject<T> = {
  [K in keyof T as T[K] extends (...args: any) => any ? never : K extends "prototype" ? never : K]: T[K];
};
export type GetActionObject<T> = {
  [K in keyof T as T[K] extends (...args: any) => any ? (K extends "prototype" ? never : K) : never]: T[K];
};

export type PromiseOrObject<T> = T | Promise<T>;
type MergeObjectValues<T> = T extends Record<string, infer V> ? (V extends Record<string, any> ? V : never) : never;
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
export type MergedValues<T> = UnionToIntersection<MergeObjectValues<T>>;
export type Assign<A, B> = Omit<A, keyof B> & B;
export type ObjectAssign<Objects extends any[]> = Objects extends [
  ...infer Rest extends Record<string, any>[],
  infer Last extends Record<string, any>,
]
  ? Rest extends []
    ? Last
    : Assign<ObjectAssign<Rest>, Last>
  : unknown;

export type MergeAll<T extends Record<string, any>[]> = T extends [
  infer First extends Record<string, any>,
  ...infer Rest extends Record<string, any>[],
]
  ? Rest extends []
    ? First
    : MergeAll<Rest> & First
  : unknown;

export type MergeAllActionTypes<T extends Type[], OmitKey extends string = never> = T extends [
  infer First extends Type,
  ...infer Rest extends Type[],
]
  ? Rest extends []
    ? Omit<GetActionObject<UnType<First>>, OmitKey>
    : MergeAllActionTypes<Rest, OmitKey> & Omit<UnType<First>, OmitKey>
  : unknown;

export type MergeAllTypes<T extends Type[], OmitKey extends string = never> = T extends [
  infer First extends Type,
  ...infer Rest extends Type[],
]
  ? Rest extends []
    ? Omit<UnType<First>, OmitKey>
    : MergeAllTypes<Rest, OmitKey> & Omit<UnType<First>, OmitKey>
  : unknown;

export type MergeAllKeyOfTypes<T extends Type<{ [key: string]: any }>[], Key extends string> = T extends [
  infer First extends Type,
  ...infer Rest extends Type[],
]
  ? Rest extends []
    ? UnType<First>[Key]
    : MergeAllKeyOfTypes<Rest, Key> & UnType<First>[Key]
  : unknown;

export type MergeAllKeyOfObjects<T extends { [key: string]: any }[], Key extends string> = T extends [
  infer First extends { [key: string]: any },
  ...infer Rest extends { [key: string]: any }[],
]
  ? Rest extends []
    ? First[Key]
    : MergeAllKeyOfObjects<Rest, Key> & First[Key]
  : unknown;

export type Primitive = string | number | boolean | null | undefined; // | symbol | bigint;

export type NestedKeysWithAllowed<T, Allowed = Primitive> = T extends Primitive
  ? never
  : T extends any[]
    ? never
    : T extends (...args: any[]) => any
      ? never
      : {
          [K in keyof T & string]: T[K] extends Allowed
            ? K
            : T[K] extends Dayjs
              ? never
              : T[K] extends { [key: string]: any }
                ? K | `${K}.${NestedKeysWithAllowed<T[K], Allowed>}`
                : never;
        }[keyof T & string];

export type SingleValue<Value> = Value extends (infer V)[] ? SingleValue<V> : Value;

export type StrArrToObject<Arr, Value> = Arr extends [infer First, ...infer Rest]
  ? { [K in First & string]: Value } & StrArrToObject<Rest, Value>
  : unknown;

export type GetValueOfKey<Model, Key extends string, Fallback = never> = Model extends { [key in Key]: any }
  ? Model[Key]
  : Fallback;
