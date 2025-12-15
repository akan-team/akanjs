/* eslint-disable @typescript-eslint/no-unsafe-return */
import { BaseInsight, BaseObject, GetStateObject, MergedValues } from "@akanjs/base";
import { FilterInfo, FilterInstance } from "@akanjs/document";
import { ApiInfo, SliceInfo } from "@akanjs/signal";

import { ModelDictInfo, ScalarDictInfo, ServiceDictInfo } from ".";

interface Trans {
  t: string;
}
interface FieldTrans {
  t: string;
  desc?: string;
}
interface FnTrans<ArgKey extends string> {
  t: string;
  desc?: string;
  arg?: { [key in ArgKey]: FieldTrans };
}
type FilterTranslatorKey<Filter extends FilterInstance> = {
  [Key in keyof Filter["query"] & string]:
    | `${Key}`
    | `${Key}.desc`
    | (Filter["query"][Key] extends FilterInfo<infer ArgNames, any>
        ? ArgNames[number] extends string
          ? `${Key}.arg.${ArgNames[number]}` | `${Key}.arg.${ArgNames[number]}.desc`
          : never
        : never);
}[keyof Filter["query"] & string];
type EndpointTranslatorKey<Endpoint> = {
  [Key in keyof Endpoint & string]:
    | `${Key}`
    | `${Key}.desc`
    | (Endpoint[Key] extends ApiInfo<any, any, infer ArgNames, any, any, any, any, any, any>
        ? ArgNames[number] extends string
          ? `${Key}.arg.${ArgNames[number]}` | `${Key}.arg.${ArgNames[number]}.desc`
          : never
        : never);
}[keyof Endpoint & string];
type SliceTranslatorKey<Slice> = {
  [Key in keyof Slice & string]: Slice[Key] extends SliceInfo<
    infer T,
    any,
    any,
    any,
    any,
    infer ArgNames,
    any,
    any,
    any
  >
    ?
        | `${T}List${Capitalize<Key>}`
        | `${T}List${Capitalize<Key>}.desc`
        | `${T}List${Capitalize<Key>}.arg.${ArgNames[number] | "skip" | "limit" | "sort"}`
        | `${T}List${Capitalize<Key>}.arg.${ArgNames[number] | "skip" | "limit" | "sort"}.desc`
        | `${T}Insight${Capitalize<Key>}`
        | `${T}Insight${Capitalize<Key>}.desc`
        | `${T}Insight${Capitalize<Key>}.arg.${ArgNames[number]}`
        | `${T}Insight${Capitalize<Key>}.arg.${ArgNames[number]}.desc`
    : never;
}[keyof Slice & string];

type SliceApiTrans<
  T extends string,
  Suffix extends string,
  ArgName extends string,
  _CapitalizedSuffix extends string = Capitalize<Suffix>,
> = {
  [K in `${T}List${_CapitalizedSuffix}`]: FnTrans<ArgName | "skip" | "limit" | "sort">;
} & {
  [K in `${T}Insight${_CapitalizedSuffix}`]: FnTrans<ArgName>;
};
type BaseModelCrudGetApiTrans<T extends string> = {
  [K in T]: FnTrans<`${T}Id`>;
} & {
  [K in `light${T}`]: FnTrans<`${T}Id`>;
} & {
  [K in `create${T}`]: FnTrans<"data">;
} & {
  [K in `update${T}`]: FnTrans<`${T}Id` | "data">;
} & {
  [K in `remove${T}`]: FnTrans<`${T}Id`>;
};

export type ModelTrans<
  T extends string,
  Model extends BaseObject,
  Insight extends BaseInsight,
  Filter extends FilterInstance,
  Slice,
  Endpoint,
  ErrorKey extends string,
  EtcKey extends string,
> = {
  modelName: Trans;
  modelDesc: Trans;
  model: { [K in keyof GetStateObject<Model>]: FieldTrans };
  insight: { [K in keyof GetStateObject<Insight>]: FieldTrans };
  query: {
    [K in keyof Filter["query"]]: Filter["query"][K] extends FilterInfo<infer ArgNames, any>
      ? FnTrans<ArgNames[number]>
      : never;
  };
  sort: { [K in keyof Filter["sort"]]: FieldTrans };
  api: {
    [K in keyof Endpoint]: Endpoint[K] extends ApiInfo<any, any, infer ArgNames, any, any, any, any, any, any>
      ? FnTrans<ArgNames[number]>
      : never;
  } & BaseModelCrudGetApiTrans<T> &
    MergedValues<{
      [K in keyof Slice]: Slice[K] extends SliceInfo<infer T, any, any, any, any, infer ArgNames, any, any, any>
        ? SliceApiTrans<T, K & string, ArgNames[number]>
        : never;
    }>;
  error: { [K in ErrorKey]: Trans };
} & { [K in EtcKey]: Trans };
export type ModelTranslatorKey<
  T extends string,
  Model,
  Insight,
  Filter extends FilterInstance,
  Slice,
  Endpoint,
  EtcKey extends string,
> =
  | `${T}.modelName`
  | `${T}.modelDesc`
  | `${T}.${keyof GetStateObject<Model> & string}${"" | ".desc"}`
  | `${T}.insight.${keyof GetStateObject<Insight> & string}${"" | ".desc"}`
  | `${T}.query.${FilterTranslatorKey<Filter>}`
  | `${T}.sort.${keyof Filter["sort"] & string}${"" | ".desc"}`
  | `${T}.signal.${EndpointTranslatorKey<Endpoint> | SliceTranslatorKey<Slice>}`
  | `${T}.${EtcKey}`;

export type ScalarTrans<T extends string, Model, ErrorKey extends string, EtcKey extends string> = {
  name: Trans;
  desc: Trans;
  model: { [K in keyof GetStateObject<Model>]: FieldTrans };
  error: { [K in ErrorKey]: Trans };
} & { [K in EtcKey]: Trans };
export type ScalarTranslatorKey<T extends string, Model, EtcKey extends string> =
  | `${T}.modelName`
  | `${T}.modelDesc`
  | `${T}.${keyof GetStateObject<Model> & string}${"" | ".desc"}`
  | `${T}.${EtcKey}`;

export type ServiceTrans<T extends string, Endpoint, ErrorKey extends string, EtcKey extends string> = {
  api: {
    [K in keyof Endpoint]: Endpoint[K] extends ApiInfo<any, any, infer ArgNames, any, any, any, any, any, any>
      ? FnTrans<ArgNames[number]>
      : never;
  };
  error: { [K in ErrorKey]: Trans };
} & { [K in EtcKey]: Trans };
export type ServiceTranslatorKey<T extends string, Endpoint, EtcKey extends string> =
  | `${T}.signal.${EndpointTranslatorKey<Endpoint>}`
  | `${T}.${EtcKey}`;

export type EnumTrans<EnumValue extends string | number> = {
  [key in EnumValue]: Trans;
};
export type EnumTranslatorKey<EnumKey extends string> = `${EnumKey}.${string}${"" | ".desc"}`;

export interface DictModule<DictKey extends string, ErrorKey extends string> {
  __Dict_Key__: DictKey;
  __Error_Key__: ErrorKey;
  dict: ModelDictInfo<any> | ScalarDictInfo<any> | ServiceDictInfo<any>;
}

export const registerModelTrans = <
  T extends string,
  Model extends BaseObject,
  Insight extends BaseInsight,
  Filter extends FilterInstance,
  Slice,
  Endpoint,
  ModelDict extends ModelDictInfo<any>,
>(
  modelDict: ModelDict
): ModelDict extends ModelDictInfo<any, any, any, any, any, infer EnumKey, any, any, any, infer ErrorKey, infer EtcKey>
  ? DictModule<
      ModelTranslatorKey<T, Model, Insight, Filter, Slice, Endpoint, EtcKey> | EnumTranslatorKey<EnumKey>,
      `${T}.error.${ErrorKey}`
    >
  : never => {
  return { dict: modelDict } as any;
};

export const registerScalarTrans = <T extends string, Model, ScalarDict>(
  scalarDict: ScalarDict
): ScalarDict extends ScalarDictInfo<any, any, infer EnumKey, infer ErrorKey, infer EtcKey>
  ? DictModule<ScalarTranslatorKey<T, Model, EtcKey> | EnumTranslatorKey<EnumKey>, `${T}.error.${ErrorKey}`>
  : never => {
  return { dict: scalarDict } as any;
};

export const registerServiceTrans = <T extends string, Endpoint, ServiceDict>(
  serviceDict: ServiceDict
): ServiceDict extends ServiceDictInfo<any, any, infer ErrorKey, infer EtcKey>
  ? DictModule<ServiceTranslatorKey<T, Endpoint, EtcKey>, `${T}.error.${ErrorKey}`>
  : never => {
  return { dict: serviceDict } as any;
};
