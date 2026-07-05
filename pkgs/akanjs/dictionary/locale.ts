import type {
  ENDPOINT_DICT_SHAPE,
  FILTER_DICT_SHAPE,
  GetStateObject,
  MergedValues,
  SLICE_DICT_SHAPE,
} from "akanjs/base";
import type { BaseInsight, BaseObject } from "akanjs/constant";
import type {
  FilterCls,
  FilterDictShape as FilterCompactShape,
  FilterDictArgShape,
  FilterInfo,
  FilterInstance,
} from "akanjs/document";
import type {
  EndpointCls,
  EndpointDictShape as EndpointCompactShape,
  EndpointInfo,
  SliceCls,
  SliceDictShape as SliceCompactShape,
  SliceInfo,
  SliceInfoArgNames,
  SliceInfoRefName,
} from "akanjs/signal";
import type { ModelDictInfo, ScalarDictInfo, ServiceDictInfo } from ".";

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
type DictArgShape = { [key: string]: readonly string[] };
type AnyFilterShape = FilterCompactShape<FilterInstance<Record<string, FilterInfo>, Record<string, unknown>>>;
type DictFilterShape<Filter> =
  Filter extends FilterCls<infer FilterShape>
    ? FilterCompactShape<FilterShape>
    : Filter extends { readonly [FILTER_DICT_SHAPE]: infer CompactShape extends FilterDictArgShape }
      ? CompactShape
      : Filter extends FilterInstance
        ? FilterCompactShape<Filter>
        : Filter extends { query: Record<string, FilterInfo>; sort: Record<string, unknown> }
          ? FilterCompactShape<Filter>
          : Filter extends { query: DictArgShape; sort: Record<string, true> }
            ? Filter
            : AnyFilterShape;
type DictFilterQuery<Filter> = DictFilterShape<Filter>["query"];
type DictFilterSort<Filter> = DictFilterShape<Filter>["sort"];
type DictArgNames<ArgNames> = ArgNames extends readonly string[] ? ArgNames[number] : never;
type DictEndpointShape<Endpoint> =
  Endpoint extends EndpointCls<infer _SrvModule, infer EndpointInfoObj>
    ? EndpointCompactShape<EndpointInfoObj>
    : Endpoint extends { readonly [ENDPOINT_DICT_SHAPE]: infer CompactShape extends DictArgShape }
      ? CompactShape
      : Endpoint extends DictArgShape
        ? Endpoint
        : Endpoint extends Record<string, EndpointInfo>
          ? EndpointCompactShape<Endpoint>
          : Record<never, never>;
type DictSliceShape<Slice> =
  Slice extends SliceCls<infer _SrvModule, infer SliceInfoObj>
    ? SliceCompactShape<SliceInfoObj>
    : Slice extends { readonly [SLICE_DICT_SHAPE]: infer CompactShape extends DictArgShape }
      ? CompactShape
      : Slice extends DictArgShape
        ? Slice
        : Slice extends Record<string, SliceInfo>
          ? SliceCompactShape<Slice>
          : Record<never, never>;
type FilterTranslatorKey<Filter> = {
  [Key in keyof DictFilterQuery<Filter> & string]:
    | `${Key}`
    | `${Key}.desc`
    | (DictArgNames<DictFilterQuery<Filter>[Key]> extends string
        ?
            | `${Key}.arg.${DictArgNames<DictFilterQuery<Filter>[Key]>}`
            | `${Key}.arg.${DictArgNames<DictFilterQuery<Filter>[Key]>}.desc`
        : never);
}[keyof DictFilterQuery<Filter> & string];
type EndpointTranslatorKey<Endpoint> = {
  [Key in keyof DictEndpointShape<Endpoint> & string]:
    | `${Key}`
    | `${Key}.desc`
    | `${Key}.arg.${DictArgNames<DictEndpointShape<Endpoint>[Key]>}`
    | `${Key}.arg.${DictArgNames<DictEndpointShape<Endpoint>[Key]>}.desc`;
}[keyof DictEndpointShape<Endpoint> & string];
type FullSliceTranslatorKey<Slice> = {
  [Key in keyof Slice & string]: Slice[Key] extends infer Info extends SliceInfo
    ?
        | `${SliceInfoRefName<Info>}List${Capitalize<Key>}`
        | `${SliceInfoRefName<Info>}List${Capitalize<Key>}.desc`
        | `${SliceInfoRefName<Info>}List${Capitalize<Key>}.arg.${SliceInfoArgNames<Info>[number] | "skip" | "limit" | "sort"}`
        | `${SliceInfoRefName<Info>}List${Capitalize<Key>}.arg.${SliceInfoArgNames<Info>[number] | "skip" | "limit" | "sort"}.desc`
        | `${SliceInfoRefName<Info>}Insight${Capitalize<Key>}`
        | `${SliceInfoRefName<Info>}Insight${Capitalize<Key>}.desc`
        | `${SliceInfoRefName<Info>}Insight${Capitalize<Key>}.arg.${SliceInfoArgNames<Info>[number]}`
        | `${SliceInfoRefName<Info>}Insight${Capitalize<Key>}.arg.${SliceInfoArgNames<Info>[number]}.desc`
    : never;
}[keyof Slice & string];
type CompactSliceTranslatorKey<T extends string, Slice> = {
  [Key in keyof DictSliceShape<Slice> & string]: Key extends ""
    ? never
    :
        | `${T}List${Capitalize<Key>}`
        | `${T}List${Capitalize<Key>}.desc`
        | `${T}List${Capitalize<Key>}.arg.${DictArgNames<DictSliceShape<Slice>[Key]> | "skip" | "limit" | "sort"}`
        | `${T}List${Capitalize<Key>}.arg.${DictArgNames<DictSliceShape<Slice>[Key]> | "skip" | "limit" | "sort"}.desc`
        | `${T}Insight${Capitalize<Key>}`
        | `${T}Insight${Capitalize<Key>}.desc`
        | `${T}Insight${Capitalize<Key>}.arg.${DictArgNames<DictSliceShape<Slice>[Key]>}`
        | `${T}Insight${Capitalize<Key>}.arg.${DictArgNames<DictSliceShape<Slice>[Key]>}.desc`;
}[keyof DictSliceShape<Slice> & string];
type SliceTranslatorKey<T extends string, Slice> =
  Slice extends Record<string, SliceInfo> ? FullSliceTranslatorKey<Slice> : CompactSliceTranslatorKey<T, Slice>;

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
  Filter,
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
    [K in keyof DictFilterQuery<Filter>]: FnTrans<DictArgNames<DictFilterQuery<Filter>[K]>>;
  };
  sort: { [K in keyof DictFilterSort<Filter>]: FieldTrans };
  api: {
    [K in keyof DictEndpointShape<Endpoint>]: FnTrans<DictArgNames<DictEndpointShape<Endpoint>[K]>>;
  } & BaseModelCrudGetApiTrans<T> &
    MergedValues<{
      [K in keyof DictSliceShape<Slice>]: SliceApiTrans<T, K & string, DictArgNames<DictSliceShape<Slice>[K]>>;
    }>;
  error: { [K in ErrorKey]: Trans };
} & { [K in EtcKey]: Trans };
export type ModelTranslatorKey<T extends string, Model, Insight, Filter, Slice, Endpoint, EtcKey extends string> =
  | `${T}.modelName`
  | `${T}.modelDesc`
  | `${T}.${keyof GetStateObject<Model> & string}${"" | ".desc"}`
  | `${T}.insight.${keyof GetStateObject<Insight> & string}${"" | ".desc"}`
  | `${T}.query.${FilterTranslatorKey<Filter>}`
  | `${T}.sort.${keyof DictFilterSort<Filter> & string}${"" | ".desc"}`
  | `${T}.signal.${EndpointTranslatorKey<Endpoint> | SliceTranslatorKey<T, Slice>}`
  | `${T}.${EtcKey}`;

export type ScalarTrans<_T extends string, Model, ErrorKey extends string, EtcKey extends string> = {
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

export type ServiceTrans<_T extends string, Endpoint, ErrorKey extends string, EtcKey extends string> = {
  api: {
    [K in keyof DictEndpointShape<Endpoint>]: FnTrans<DictArgNames<DictEndpointShape<Endpoint>[K]>>;
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
  dict:
    | ModelDictInfo<[string, ...string[]]>
    | ScalarDictInfo<[string, ...string[]]>
    | ServiceDictInfo<[string, ...string[]]>;
}

export const registerModelTrans = <
  RefName extends string,
  Model extends BaseObject,
  Insight extends BaseInsight,
  Filter,
  Slice,
  Endpoint,
  ModelDict,
>(
  modelDict: ModelDict,
): ModelDict extends ModelDictInfo<
  infer _Languages,
  infer _ModelKey,
  infer _InsightKey,
  infer _QueryKey,
  infer _SortKey,
  infer EnumKey,
  infer _BaseSignalKey,
  infer _SliceKey,
  infer _EndpointKey,
  infer ErrorKey,
  infer EtcKey
>
  ? DictModule<
      ModelTranslatorKey<RefName, Model, Insight, Filter, Slice, Endpoint, EtcKey> | EnumTranslatorKey<EnumKey>,
      `${RefName}.error.${ErrorKey}`
    >
  : never => {
  return { dict: modelDict } as unknown as ModelDict extends ModelDictInfo<
    infer _Languages,
    infer _ModelKey,
    infer _InsightKey,
    infer _QueryKey,
    infer _SortKey,
    infer EnumKey,
    infer _BaseSignalKey,
    infer _SliceKey,
    infer _EndpointKey,
    infer ErrorKey,
    infer EtcKey
  >
    ? DictModule<
        ModelTranslatorKey<RefName, Model, Insight, Filter, Slice, Endpoint, EtcKey> | EnumTranslatorKey<EnumKey>,
        `${RefName}.error.${ErrorKey}`
      >
    : never;
};

export const registerScalarTrans = <T extends string, Model, ScalarDict>(
  scalarDict: ScalarDict,
): ScalarDict extends ScalarDictInfo<infer _Languages, infer _ModelKey, infer EnumKey, infer ErrorKey, infer EtcKey>
  ? DictModule<ScalarTranslatorKey<T, Model, EtcKey> | EnumTranslatorKey<EnumKey>, `${T}.error.${ErrorKey}`>
  : never => {
  return { dict: scalarDict } as unknown as ScalarDict extends ScalarDictInfo<
    infer _Languages,
    infer _ModelKey,
    infer EnumKey,
    infer ErrorKey,
    infer EtcKey
  >
    ? DictModule<ScalarTranslatorKey<T, Model, EtcKey> | EnumTranslatorKey<EnumKey>, `${T}.error.${ErrorKey}`>
    : never;
};

export const registerServiceTrans = <T extends string, Endpoint, ServiceDict>(
  serviceDict: ServiceDict,
): ServiceDict extends ServiceDictInfo<infer _Languages, infer _EndpointKey, infer ErrorKey, infer EtcKey>
  ? DictModule<ServiceTranslatorKey<T, Endpoint, EtcKey>, `${T}.error.${ErrorKey}`>
  : never => {
  return { dict: serviceDict } as unknown as ServiceDict extends ServiceDictInfo<
    infer _Languages,
    infer _EndpointKey,
    infer ErrorKey,
    infer EtcKey
  >
    ? DictModule<ServiceTranslatorKey<T, Endpoint, EtcKey>, `${T}.error.${ErrorKey}`>
    : never;
};
