/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  BaseObject,
  DataList,
  type GetActionObject,
  type GetStateObject,
  MergeAll,
  type MergedValues,
  type Prettify,
  type PromiseOrObject,
  Type,
} from "@akanjs/base";
import { FetchPolicy } from "@akanjs/common";
import { ConstantModel, DefaultOf, DocumentModel, ProtoFile, QueryOf } from "@akanjs/constant";
import type { ExtractQuery, ExtractSort, FilterInstance } from "@akanjs/document";
import { AnyVariables } from "@urql/core";

import { type Client } from ".";
import { type DefaultSignal, type SliceMeta } from "./signalDecorators";

export class GqlStorage {}

export interface FetchInitForm<
  Input,
  Full,
  Filter extends FilterInstance,
  _DefaultInput = DefaultOf<Input>,
  _Sort = ExtractSort<Filter>,
> {
  page?: number;
  limit?: number;
  sort?: _Sort;
  default?: Partial<_DefaultInput>;
  invalidate?: boolean;
  insight?: boolean;
}

export type ServerInit<
  T extends string,
  Light,
  Insight = any,
  QueryArgs = any[],
  Filter extends FilterInstance = any,
  _CapitalizedT extends string = Capitalize<T>,
  _Sort = ExtractSort<Filter>,
> = SliceMeta & {
  [K in `${T}ObjList`]: Light[];
} & {
  [K in `${T}ObjInsight`]: Insight;
} & {
  [K in `pageOf${_CapitalizedT}`]: number;
} & {
  [K in `lastPageOf${_CapitalizedT}`]: number;
} & {
  [K in `limitOf${_CapitalizedT}`]: number;
} & {
  [K in `queryArgsOf${_CapitalizedT}`]: QueryArgs;
} & {
  [K in `sortOf${_CapitalizedT}`]: _Sort;
} & {
  [K in `${T}InitAt`]: Date;
};
export type ClientInit<
  T extends string,
  Light,
  Insight = any,
  QueryArgs = any[],
  Filter extends FilterInstance = any,
  _CapitalizedT extends string = Capitalize<T>,
  _Sort = ExtractSort<Filter>,
> = PromiseOrObject<ServerInit<T, Light, Insight, QueryArgs, Filter, _CapitalizedT, _Sort>>;

export type ServerView<T extends string, Model> = { refName: T } & { [K in `${T}Obj`]: Model } & {
  [K in `${T}ViewAt`]: Date;
};
export type ClientView<T extends string, Model> = PromiseOrObject<ServerView<T, Model>>;

export type ServerEdit<T extends string, Model> = { refName: T } & { [K in `${T}Obj`]: Model } & {
  [K in `${T}ViewAt`]: Date;
};
export type ClientEdit<T extends string, Model> = PromiseOrObject<ServerEdit<T, Model>>;

type RemoveLast3<T extends any[]> = T extends [...infer Rest, any, any, any] ? Rest : T;
export type FilterListArgs<Args extends any[]> = PartialNullableArgs<RemoveLast3<Args>>;

// =============================== DbGraphQL =============================== //

type FetchOption<
  Input,
  Full,
  Filter extends FilterInstance,
  _DefaultInput = DefaultOf<Input>,
  _Sort = ExtractSort<Filter>,
> = FetchPolicy & FetchInitForm<Input, Full, Filter, _DefaultInput, _Sort>;

// ============= Helper Types for Cleaner Code =============

// Common return type patterns
type ViewReturn<T extends string, Full> = {
  [K in T]: Full;
} & {
  [K in `${T}View`]: ServerView<T, Full>;
};

type EditReturn<T extends string, Full> = {
  [K in T]: Full;
} & {
  [K in `${T}Edit`]: ServerEdit<T, Full>;
};

type InitReturn<
  T extends string,
  Light extends { id: string },
  Insight,
  Args,
  Filter extends FilterInstance,
  _CapitalizedT extends string = Capitalize<T>,
  _Sort = ExtractSort<Filter>,
> = { [K in `${T}Init`]: ServerInit<T, Light, Insight, Args, Filter, _CapitalizedT, _Sort> } & {
  [K in `${T}List`]: DataList<Light>;
} & { [K in `${T}Insight`]: Insight };

// ============= Method Generators =============

// Generate basic CRUD methods
type BasicMethods<
  T extends string,
  Input,
  Full,
  Light extends { id: string },
  Insight,
  _CapitalizedT extends string = Capitalize<T>,
> = {
  [K in `add${_CapitalizedT}Files`]: (
    fileList: FileList,
    parentId?: string,
    option?: FetchPolicy
  ) => Promise<ProtoFile[]>;
} & {
  [K in `merge${_CapitalizedT}`]: (
    modelOrId: Full | string,
    data: Partial<DocumentModel<Input>>,
    option?: FetchPolicy
  ) => Promise<Full>;
} & {
  [K in `${T}SortKeys`]?: string[];
};

// Generate view/edit methods
type ViewEditMethods<T extends string, Full, _CapitalizedT extends string = Capitalize<T>> = {
  [K in `view${_CapitalizedT}`]: (id: string, option?: FetchPolicy) => Promise<ViewReturn<T, Full>>;
} & {
  [K in `get${_CapitalizedT}View`]: (id: string, option?: FetchPolicy) => ClientView<T, Full>;
} & {
  [K in `edit${_CapitalizedT}`]: (id: string, option?: FetchPolicy) => Promise<EditReturn<T, Full>>;
} & {
  [K in `get${_CapitalizedT}Edit`]: (id: string, option?: FetchPolicy) => ClientEdit<T, Full>;
};

// Generate init methods
type InitMethods<
  T extends string,
  Input,
  Full,
  Light extends { id: string },
  Insight,
  Filter extends FilterInstance,
  _CapitalizedT extends string = Capitalize<T>,
  _QueryOfDoc = QueryOf<DocumentModel<Full>>,
  _DefaultInput = DefaultOf<Input>,
  _Sort = ExtractSort<Filter>,
> = {
  [K in `init${_CapitalizedT}`]: (
    query?: _QueryOfDoc,
    option?: FetchOption<Input, Full, Filter, _DefaultInput, _Sort>
  ) => Promise<InitReturn<T, Light, Insight, [query?: _QueryOfDoc], Filter, _CapitalizedT, _Sort>>;
} & {
  [K in `get${_CapitalizedT}Init`]: (
    query?: _QueryOfDoc,
    option?: FetchOption<Input, Full, Filter, _DefaultInput, _Sort>
  ) => ClientInit<T, Light, Insight, [query?: _QueryOfDoc], Filter, _CapitalizedT, _Sort>;
};

type DynamicListMethodsOfKey<
  T extends string,
  Input,
  Full,
  Light extends { id: string },
  Insight,
  Filter extends FilterInstance,
  Suffix extends string,
  QueryArgs extends any[],
  _CapitalizedT extends string = Capitalize<T>,
  _DefaultInput = DefaultOf<Input>,
  _Sort = ExtractSort<Filter>,
> = {
  [Key in `init${_CapitalizedT}${Suffix}`]: (
    ...args: [...queryArgs: QueryArgs, option?: FetchOption<Input, Full, Filter, _DefaultInput, _Sort>]
  ) => Promise<
    { [P in `${T}Init${Suffix}`]: ServerInit<T, Light, Insight, QueryArgs, Filter, _CapitalizedT, _Sort> } & {
      [P in `${T}List${Suffix}`]: DataList<Light>;
    } & { [P in `${T}Insight${Suffix}`]: Insight }
  >;
} & {
  [Key in `get${_CapitalizedT}Init${Suffix}`]: (
    ...args: [...queryArgs: QueryArgs, option?: FetchOption<Input, Full, Filter, _DefaultInput, _Sort>]
  ) => ClientInit<T, Light, Insight, QueryArgs, Filter, _CapitalizedT, _Sort>;
};

type DynamicListMethods<
  T extends string,
  Input,
  Full,
  Light extends { id: string },
  Insight,
  Filter extends FilterInstance,
  Signal,
  _CapitalizedT extends string = Capitalize<T>,
  _DefaultInput = DefaultOf<Input>,
  _Sort = ExtractSort<Filter>,
  _DynamicSliceArgMap = DynamicSliceArgMap<T, Input, Full, Filter, Signal, _CapitalizedT, _DefaultInput, _Sort>,
> = MergedValues<{
  [K in keyof _DynamicSliceArgMap]: K extends string
    ? _DynamicSliceArgMap[K] extends any[]
      ? DynamicListMethodsOfKey<
          T,
          Input,
          Full,
          Light,
          Insight,
          Filter,
          K,
          _DynamicSliceArgMap[K],
          _CapitalizedT,
          _DefaultInput,
          _Sort
        >
      : never
    : never;
}>;

export type DynamicSliceArgMap<
  T extends string,
  Input,
  Full,
  Filter extends FilterInstance,
  Signal,
  _CapitalizedT extends string = Capitalize<T>,
  _DefaultInput = DefaultOf<Input>,
  _Sort = ExtractSort<Filter>,
> = {
  [K in keyof Signal as K extends `${T}List${infer Suffix}` ? Suffix : never]: Signal[K] extends (
    ...args: infer Args
  ) => Promise<Full[]>
    ? FilterListArgs<Args>
    : never;
};

// ============= Main Optimized Type =============

export type DbGraphQL<
  T extends string,
  Input,
  Full,
  Light extends { id: string },
  Insight,
  Filter extends FilterInstance,
  Fetch,
  Signal,
  _CapitalizedT extends string = Capitalize<T>,
  _Default = DefaultOf<Full>,
  _DefaultInput = DefaultOf<Input>,
  _DefaultState = GetStateObject<Full>,
  _DefaultStateInput = GetStateObject<Input>,
  _Doc = DocumentModel<Full>,
  _DocInput = DocumentModel<Input>,
  _QueryOfDoc = QueryOf<DocumentModel<Full>>,
  _Query = ExtractQuery<Filter>,
  _Sort = ExtractSort<Filter>,
  _DynamicSliceArgMap = DynamicSliceArgMap<T, Input, Full, Filter, Signal, _CapitalizedT, _DefaultInput, _Sort>,
> = {
  refName: string;
  slices: SliceMeta[];
} & GetWsMessageOf<Signal> &
  GetWsPubsubOf<Signal> &
  BasicMethods<T, Input, Full, Light, Insight, _CapitalizedT> &
  ViewEditMethods<T, Full, _CapitalizedT> &
  InitMethods<T, Input, Full, Light, Insight, Filter, _CapitalizedT, _QueryOfDoc, _DefaultInput, _Sort> &
  Fetch &
  DynamicListMethods<
    T,
    Input,
    Full,
    Light,
    Insight,
    Filter,
    Signal,
    _CapitalizedT,
    _DefaultInput,
    _Sort,
    _DynamicSliceArgMap
  >;

// =============================== DbGraphQL =============================== //

type PartialNullableArgs<T extends any[]> = T extends [infer Head, ...infer Rest]
  ? null extends Head
    ? Partial<T>
    : [Head, ...PartialNullableArgs<Rest>]
  : [];

// ============= Core Helper Types =============

type EnsurePromise<T> = T extends Promise<any> ? T : Promise<T>;
type ApplyVoidReturn<T> = T extends (...args: infer A) => any ? (...args: A) => void : never;
type HasMarker<Fn, Marker> = Fn extends (...args: any) => Promise<{ __Returns__: Marker }>
  ? true
  : Fn extends (...args: any) => { __Returns__: Marker }
    ? true
    : false;

export type GetQueryMutationOf<Sig, M = unknown> = {
  [K in keyof Sig as K extends keyof M ? never : HasMarker<Sig[K], string> extends true ? never : K]: Sig[K] extends (
    ...args: any
  ) => any
    ? Sig[K] extends (...args: infer Args) => infer Return
      ? (...args: [...PartialNullableArgs<Args>, option?: FetchPolicy]) => EnsurePromise<Return>
      : never
    : never;
};

type EmitMethods<Sig> = {
  [K in keyof Sig as HasMarker<Sig[K], "Emit"> extends true ? K : never]: Sig[K] extends (...args: any) => any
    ? ApplyVoidReturn<Sig[K]>
    : never;
};
type ListenMethods<Sig> = {
  [K in keyof Sig as K extends string
    ? HasMarker<Sig[K], "Emit"> extends true
      ? `listen${Capitalize<K>}`
      : never
    : never]: Sig[K] extends (...args: any) => infer R
    ? (handleEvent: (data: Awaited<R>) => any, options?: FetchPolicy) => () => void
    : never;
};
export type GetWsMessageOf<Sig> = EmitMethods<Sig> & ListenMethods<Sig>;

type RemoveReturnMeta<Return> = Return extends infer R & { __Returns__: any } ? R : Return;
type GenerateSubscribeMethod<Fn> = Fn extends (...args: infer Args) => infer R
  ? (
      ...args: [...args: Args, onData: (data: RemoveReturnMeta<Awaited<R>>) => void, fetchPolicy?: FetchPolicy]
    ) => () => void
  : never;
export type GetWsPubsubOf<Sig> = {
  [K in keyof Sig as K extends string
    ? HasMarker<Sig[K], "Subscribe"> extends true
      ? `subscribe${Capitalize<K>}`
      : never
    : never]: GenerateSubscribeMethod<Sig[K]>;
};

type LightWeightFetch<Fetch, Full, Light> = {
  [K in keyof Fetch]: Fetch[K] extends (...args: infer Args) => Promise<Full[]>
    ? (...args: Args) => Promise<Light[]>
    : Fetch[K];
};

export const getGqlOnStorage = (refName: string) => {
  const modelGql = Reflect.getMetadata(refName, GqlStorage.prototype) as { [key: string]: any } | undefined;
  if (!modelGql) throw new Error("Gql is not defined");
  return modelGql;
};
export const setGqlOnStorage = (refName: string, modelGql: any) => {
  Reflect.defineMetadata(refName, modelGql, GqlStorage.prototype);
};

export const gqlOf = <
  T extends string,
  Input,
  Obj extends BaseObject,
  Full extends { id: string },
  Light extends { id: string },
  Insight,
  Filter extends FilterInstance,
  Signal,
  _CapitalizedT extends string,
  _Default,
  _DefaultInput,
  _DefaultState,
  _DefaultStateInput,
  _DefaultInsight,
  _PurifiedInput,
  _Doc,
  _DocInput,
  _QueryOfDoc,
  _Sort = ExtractSort<Filter>,
  _SignalAction = GetActionObject<Signal>,
>(
  constant: ConstantModel<
    T,
    Input,
    Obj,
    Full,
    Light,
    Insight,
    _CapitalizedT,
    _Default,
    _DefaultInput,
    _DefaultState,
    _DefaultStateInput,
    _DefaultInsight,
    _PurifiedInput,
    _Doc,
    _DocInput,
    _QueryOfDoc
  >,
  filterRef: Type<Filter>,
  sigRef: Type<Signal>
): DbGraphQL<
  T,
  Input,
  Full,
  Light,
  Insight,
  Filter,
  LightWeightFetch<
    GetQueryMutationOf<
      _SignalAction &
        DefaultSignal<T, Input, Full, Light, Insight, Filter, _CapitalizedT, _PurifiedInput, _QueryOfDoc, _Sort>,
      Full
    >,
    Full,
    Light
  >,
  _SignalAction,
  _CapitalizedT,
  _Default,
  _DefaultInput,
  _DefaultState,
  _DefaultStateInput,
  _Doc,
  _DocInput,
  _QueryOfDoc,
  _Sort
> => {
  return null as any;
};

export const query = async <Query = any>(
  fetchClient: Client,
  query: string,
  variables: AnyVariables = {},
  option: FetchPolicy = {}
) => {
  const jwt = option.url ? null : await fetchClient.getJwt();
  const { data, error } = await fetchClient.gql
    .query<Query>(query, variables, {
      fetch,
      url: option.url ?? fetchClient.uri,
      requestPolicy:
        typeof option.cache === "string" ? option.cache : option.cache === true ? "cache-first" : "network-only",
      fetchOptions: {
        ...(typeof option.cache === "number"
          ? { next: { revalidate: option.cache } }
          : option.cache === true
            ? { cache: "force-cache" }
            : { cache: "no-store" }),
        headers: {
          "apollo-require-preflight": "true",
          ...(jwt ? { authorization: `Bearer ${jwt}` } : {}),
          ...(option.token ? { authorization: `Bearer ${option.token}` } : {}),
        },
      },
    })
    .toPromise();
  if (!data) {
    const content = error?.graphQLErrors[0]?.message ?? "Unknown Error";
    if (option.onError) {
      option.onError(content);
      return;
    } else throw new Error(content);
  }
  return data;
};
export const mutate = async <Mutation = any>(
  fetchClient: Client,
  mutation: string,
  variables: AnyVariables = {},
  option: FetchPolicy = {}
) => {
  const jwt = option.url ? null : await fetchClient.getJwt();
  const { data, error } = await fetchClient.gql
    .mutation<Mutation>(mutation, variables, {
      fetch,
      url: option.url ?? fetchClient.uri,
      requestPolicy: "network-only",
      fetchOptions: {
        cache: "no-store",
        headers: {
          "apollo-require-preflight": "true",
          ...(jwt ? { authorization: `Bearer ${jwt}` } : {}),
          ...(option.token ? { authorization: `Bearer ${option.token}` } : {}),
        },
      },
    })
    .toPromise();
  if (!data) {
    const content = error?.graphQLErrors[0]?.message ?? "Unknown Error";
    if (option.onError) {
      option.onError(content);
      return;
    } else throw new Error(content);
  }
  return data;
};

export const fetchOf = <Signal, _SignalAction = GetActionObject<Signal>>(
  sigRef: Type<Signal>
): GetWsMessageOf<_SignalAction> & GetWsPubsubOf<_SignalAction> & GetQueryMutationOf<_SignalAction> => {
  return null as any;
};

type CustomFetch<T> = Omit<T, "client" | "clone"> & {
  client: Client;
  clone: (option?: { jwt: string | null }) => CustomFetch<T>;
  // [Symbol.dispose]: () => void;
};
export const makeFetch = <Fetches extends object[]>(...fetches: Fetches): Prettify<CustomFetch<MergeAll<Fetches>>> => {
  return null as any;
};
