import type { Cls, EnumInstance, MergeAllDoubleKeyOfObjects } from "akanjs/base";
import { FILTER_DICT_SHAPE, FILTER_META, getNonArrayModel, isEnum } from "akanjs/base";
import {
  type BaseObject,
  type ConstantFieldType,
  type ConstantFieldTypeInput,
  type DocumentModel,
  deserialize,
  type FieldToValue,
  type PlainTypeToFieldType,
  type QueryOf,
  type Serialized,
} from "akanjs/constant";

import { type DocumentQuery, type DocumentQueryHelper, documentQueryHelper } from "./documentQuery";
import type { ConstantFilterMeta } from "./types";

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isFilterModel = (filterRef: Cls<unknown, { [FILTER_META]?: ConstantFilterMeta }>): boolean =>
  filterRef[FILTER_META] !== undefined;
export const getFilterMeta = <AllowEmpty extends boolean = false>(
  filterRef: Cls<unknown, { [FILTER_META]?: ConstantFilterMeta }> | FilterCls,
  { allowEmpty = false as AllowEmpty }: { allowEmpty?: AllowEmpty } = {},
): AllowEmpty extends true ? ConstantFilterMeta | undefined : ConstantFilterMeta => {
  const filterMeta = filterRef[FILTER_META];
  if (!filterMeta && !allowEmpty) throw new Error("filterMeta is not defined");
  return filterMeta as AllowEmpty extends true ? ConstantFilterMeta | undefined : ConstantFilterMeta;
};
export const setFilterMeta = (
  filterRef: Cls<unknown, { [FILTER_META]?: ConstantFilterMeta; sortField: Set<string> }>,
  filterMeta: ConstantFilterMeta,
  ...libFilterMetas: ConstantFilterMeta[]
) => {
  const sortField = new Set(
    Object.values(filterMeta.sort)
      .filter(isObjectRecord)
      .flatMap((sort) => Object.keys(sort)),
  );
  const existingFilterMeta = getFilterMeta(filterRef, { allowEmpty: true });
  if (existingFilterMeta)
    Object.assign(existingFilterMeta, {
      ...filterMeta,
      query: Object.assign(
        existingFilterMeta.query,
        ...libFilterMetas.map((libFilterMeta) => libFilterMeta.query),
        filterMeta.query,
      ),
      sort: Object.assign(
        existingFilterMeta.sort,
        ...libFilterMetas.map((libFilterMeta) => libFilterMeta.sort),
        filterMeta.sort,
      ),
    });
  else
    Object.assign(filterRef, {
      [FILTER_META]: {
        query: Object.assign({}, ...libFilterMetas.map((libFilterMeta) => libFilterMeta.query), filterMeta.query),
        sort: Object.assign({}, ...libFilterMetas.map((libFilterMeta) => libFilterMeta.sort), filterMeta.sort),
      },
    });
  for (const field of sortField) filterRef.sortField.add(field);
};
export const getFilterInfoByKey = <ArgNames extends string[] = [], Args extends any[] = any[], Model = any>(
  modelRef: FilterCls,
  key: string,
): FilterInfo<ArgNames, Args, Model> => {
  const queryMeta = getFilterMeta(modelRef).query[key];
  if (!queryMeta) throw new Error(`queryMeta is not defined for key: ${key}`);
  return queryMeta;
};
export const setFilterInfoByKey = <ArgNames extends string[] = [], Args extends any[] = any[], Model = any>(
  modelRef: Cls<Model>,
  key: string,
  filterInfo: FilterInfo<ArgNames, Args, Model>,
) => {
  const filterMeta = getFilterMeta(modelRef);
  Object.assign(filterMeta.query, { [key]: filterInfo });
};
export const getFilterSortByKey = (modelRef: FilterCls, key: string) => getFilterMeta(modelRef).sort[key];

export const fillMissingFilterArgs = (filterInfo: FilterInfo, args: unknown[]) => {
  if (args.length >= filterInfo.args.length) return args;
  return [...args, ...Array(filterInfo.args.length - args.length).fill(undefined)];
};

const queryOptionKeys = new Set(["select", "skip", "limit", "sort", "sample"]);
// A trailing plain object whose every key names a query option is the option: a filter arg is never that shape, and
// `{}` read as a filter arg would be a truthy value nobody passed on purpose.
const isQueryOptionArg = (value: unknown) => {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  return Object.keys(value).every((key) => queryOptionKeys.has(key));
};

/** Shared by the database and service resolvers, so the two cannot disagree about what a query option is. */
export const splitFilterArgs = (filterInfo: FilterInfo, args: unknown[]) => {
  const hasQueryOption = args.length > filterInfo.args.length || isQueryOptionArg(args.at(-1));
  return {
    queryArgs: fillMissingFilterArgs(filterInfo, hasQueryOption ? args.slice(0, -1) : args),
    queryOption: (hasQueryOption ? args.at(-1) : {}) as Record<string, unknown>,
  };
};

export interface FilterArgInfo {
  name: string;
  argRef: ConstantFieldType;
  arrDepth: number;
  enum?: EnumInstance;
  nullable: boolean;
  ref?: string;
}
/** Unwraps a filter arg's declaration the way `EndpointInfo.getArgInfo` unwraps an endpoint's. */
export const getFilterArgInfo = (arg: FilterInfo["args"][number]): FilterArgInfo => {
  const [singleArg, arrDepth] = getNonArrayModel(arg.argRef as Cls);
  const argIsEnum = isEnum(singleArg);
  return {
    name: arg.name,
    argRef: (argIsEnum ? (singleArg as EnumInstance).type : singleArg) as ConstantFieldType,
    arrDepth,
    enum: argIsEnum ? (singleArg as EnumInstance) : undefined,
    nullable: !!arg.option?.nullable,
    ref: arg.option?.ref,
  };
};
export const getFilterArgInfos = (filterInfo: FilterInfo): FilterArgInfo[] => filterInfo.args.map(getFilterArgInfo);

/** A caller named a filter that does not exist, or gave it arguments it cannot take. Its callers answer 400. */
export class FilterQueryError extends Error {}

const tryDeserializeFilterArg = (arg: FilterArgInfo, value: unknown, key: string) => {
  try {
    return deserialize(arg.argRef, arg.arrDepth, value, { key: arg.name, nullable: arg.nullable });
  } catch (error) {
    throw new FilterQueryError(
      `Invalid filter argument "${arg.name}" for key: ${key}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/**
 * The root slice's contract: each arg is parsed by its declared type (an invalid id is refused rather than matching
 * nothing), and args past the declared ones are dropped — the caller names a filter, never a query.
 */
export const resolveFilterQuery = (
  filterRef: FilterCls,
  queryKey?: string | null,
  args?: unknown[] | null,
): QueryOf<any> => {
  const key = queryKey || "any";
  const filterInfo = getFilterMeta(filterRef).query[key];
  const queryFn = filterInfo?.queryFn;
  if (!queryFn) throw new FilterQueryError(`No filter query for key: ${key}`);
  const given = Array.isArray(args) ? args : [];
  const queryArgs = getFilterArgInfos(filterInfo).map((arg, idx) => {
    const value = given[idx];
    if (!arg.nullable && (value === null || value === undefined))
      throw new FilterQueryError(`Missing filter argument "${arg.name}" for key: ${key}`);
    const parsed = tryDeserializeFilterArg(arg, value, key);
    // Every other filter call path pads a missing optional with `undefined`; a query that tests `arg === undefined`
    // must not start seeing `null` because the args arrived over the wire.
    return parsed === null ? undefined : parsed;
  });
  // Whatever the filter body itself throws travels as it is: that one is the app's bug, not the caller's.
  return queryFn(...queryArgs, documentQueryHelper) as QueryOf<any>;
};

export const assertFilterFitsCrud = (refName: string, queryKey: string, className: string) => {
  if (queryKey.toLowerCase() !== refName.toLowerCase()) return;
  throw new Error(
    `Filter "${queryKey}" on "${refName}" generates remove${className}/update${className}, which are the generated CRUD methods; rename the filter`,
  );
};

export type BaseFilterSortKey = "latest" | "oldest" | "relevance";
export type BaseFilterQueryKey = "any";
export type BaseFilterKey = BaseFilterSortKey | BaseFilterQueryKey;

export type FilterInstance<
  Query extends { [key: string]: FilterInfo } = Record<never, never>,
  Sort extends { [key: string]: unknown } = Record<never, never>,
> = {
  query: Query;
  sort: Sort;
};
export type FilterDictArgShape = {
  query: { [key: string]: readonly string[] };
  sort: { [key: string]: true };
};
export type FilterDictShape<Filter extends FilterInstance> = {
  query: {
    [K in keyof Filter["query"]]: Filter["query"][K] extends FilterInfo<infer ArgNames, infer _Args, infer _Model>
      ? ArgNames
      : never;
  };
  sort: { [K in keyof Filter["sort"]]: true };
};
export interface FilterDictShapeCarrier<DictShape extends FilterDictArgShape = FilterDictArgShape> {
  readonly [FILTER_DICT_SHAPE]: DictShape;
}
interface BaseQuery<Model> {
  any: FilterInfo<[], [], Model>;
}
interface BaseSort {
  latest: { createdAt: -1 };
  oldest: { createdAt: 1 };
  // An empty sort map orders by search relevance; without a `q.search()` it falls back to the default ordering.
  relevance: Record<string, never>;
}
type LibFilterQuery<LibFilters extends FilterCls[]> = MergeAllDoubleKeyOfObjects<
  LibFilters,
  typeof FILTER_META,
  "query"
>;
type LibFilterSort<LibFilters extends FilterCls[]> = MergeAllDoubleKeyOfObjects<LibFilters, typeof FILTER_META, "sort">;
type FilterQuery<Full, LibFilters extends FilterCls[], Filter extends FilterInstance> = BaseQuery<Full> &
  LibFilterQuery<LibFilters> &
  Filter["query"];
type FilterSort<LibFilters extends FilterCls[], Filter extends FilterInstance> = BaseSort &
  LibFilterSort<LibFilters> &
  Filter["sort"];
type MergedFilterInstance<Full, LibFilters extends FilterCls[], Filter extends FilterInstance> = {
  query: FilterQuery<Full, LibFilters, Filter>;
  sort: FilterSort<LibFilters, Filter>;
};

export type ExtractQuery<Filter extends FilterInstance> = {
  [K in keyof Filter["query"]]: Filter["query"][K] extends FilterInfo<any, infer Args>
    ? (...args: Args) => QueryOf<any>
    : never;
};
export type ExtractSort<Filter extends FilterInstance> = keyof Filter["sort"];
export interface FilterCls<Filter extends FilterInstance = any, Query = unknown, Sort = unknown>
  extends Cls<FilterDictShapeCarrier<FilterDictShape<Filter>> & { [key: string]: unknown }> {
  [FILTER_META]: Filter;
  prototype: FilterDictShapeCarrier<FilterDictShape<Filter>> & { [key: string]: unknown };
  sortField: Set<string>;
  _Query: Query;
  _Sort: Sort;
}
export type FilterQueryOf<FilterRef extends FilterCls> = FilterRef extends { _Query: infer Query } ? Query : never;
export type FilterSortOf<FilterRef extends FilterCls> = FilterRef extends { _Sort: infer Sort } ? Sort : never;

export const from = <
  Full extends BaseObject,
  BuildFilter extends (filter: () => FilterInfo<[], [], Full>) => FilterInstance,
  LibFilters extends FilterCls[],
  _Filter extends ReturnType<BuildFilter>,
  _MergedFilter extends FilterInstance = MergedFilterInstance<Full, LibFilters, _Filter>,
  _Query = ExtractQuery<_MergedFilter>,
  _Sort = ExtractSort<_MergedFilter>,
>(
  modelRef: Cls<Full>,
  buildFilter: BuildFilter,
  ...libFilterRefs: LibFilters
) => {
  class Base {
    static sortField: Set<string> = new Set();
  }
  const querySort = buildFilter(filter);
  setFilterMeta(
    Base,
    {
      query: {
        any: filter().query((_q) => ({ removedAt: { empty: true } })),
        ...querySort.query,
      },
      sort: Object.assign({ latest: { createdAt: -1 }, oldest: { createdAt: 1 }, relevance: {} }, querySort.sort),
    },
    ...libFilterRefs.map((libFilterRef) => getFilterMeta(libFilterRef)),
  );
  return Base as unknown as FilterCls<_MergedFilter, _Query, _Sort>;
};

interface ArgProps<Value = unknown> {
  nullable?: boolean;
  ref?: string;
  default?: Value;
}
export class FilterInfo<ArgNames extends string[] = any, Args extends any[] = any, Model = any> {
  readonly argNames: ArgNames = [] as unknown as ArgNames;
  readonly args: { name: string; argRef: ConstantFieldTypeInput; option?: ArgProps }[];
  queryFn: ((...args: [...Args, q: DocumentQueryHelper]) => DocumentQuery<Model>) | null = null;

  constructor() {
    this.args = [];
  }
  arg<
    ExplicitType,
    Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>,
    ArgName extends string = "unknown",
    _FieldToValue = DocumentModel<FieldToValue<Arg>>,
  >(name: ArgName, argRef: Arg, option?: Omit<ArgProps<_FieldToValue>, "nullable">) {
    if (this.queryFn) throw new Error("Query function is already set");
    else if (this.args.at(-1)?.option?.nullable) throw new Error("Last argument is nullable");
    this.argNames.push(name);
    this.args.push({ name, argRef, option });
    return this as unknown as FilterInfo<[...ArgNames, ArgName], [...Args, arg: _FieldToValue], Model>;
  }
  opt<
    ExplicitType,
    Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>,
    ArgName extends string = "unknown",
    _FieldToValue = DocumentModel<FieldToValue<Arg>>,
  >(name: ArgName, argRef: Arg, option?: Omit<ArgProps<_FieldToValue>, "nullable">) {
    if (this.queryFn) throw new Error("Query function is already set");
    this.argNames.push(name);
    this.args.push({ name, argRef, option: { ...option, nullable: true } });
    return this as unknown as FilterInfo<[...ArgNames, ArgName], [...Args, opt?: _FieldToValue | null], Model>;
  }
  query(query: (...args: [...Args, q: DocumentQueryHelper]) => DocumentQuery<Serialized<DocumentModel<Model>>>) {
    if (this.queryFn) throw new Error("Query function is already set");
    this.queryFn = query;
    return this;
  }
}

export const filter = () => new FilterInfo<[], [], any>();
