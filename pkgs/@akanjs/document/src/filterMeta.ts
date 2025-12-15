import { type BaseObject, getNonArrayModel, MergeAllKeyOfTypes, type Type } from "@akanjs/base";
import { applyMixins } from "@akanjs/common";
import { ConstantFieldTypeInput, FieldToValue, PlainTypeToFieldType, QueryOf } from "@akanjs/constant";

import type { ConstantFilterMeta, FilterArgMeta, FilterKeyMeta } from "./types";

export const isFilterModel = (filterRef: Type): boolean => {
  return Reflect.getMetadata("filter", filterRef.prototype as object) !== undefined;
};
export const getFilterMeta = (filterRef: Type) => {
  const filterMeta = Reflect.getMetadata("filter", filterRef.prototype as object) as ConstantFilterMeta | undefined;
  if (!filterMeta) throw new Error("filterMeta is not defined");
  return filterMeta;
};
export const setFilterMeta = (filterRef: Type, filterMeta: ConstantFilterMeta) => {
  const existingFilterMeta = Reflect.getMetadata("filter", filterRef.prototype as object) as
    | ConstantFilterMeta
    | undefined;
  if (existingFilterMeta)
    Object.assign(existingFilterMeta, { ...filterMeta, sort: { ...existingFilterMeta.sort, ...filterMeta.sort } });
  else Reflect.defineMetadata("filter", filterMeta, filterRef.prototype as object);
};
export const getFilterKeyMetaMapOnPrototype = (prototype: object): Map<string, FilterKeyMeta> => {
  const metadataMap =
    (Reflect.getMetadata("filterKey", prototype) as Map<string, FilterKeyMeta> | undefined) ??
    new Map<string, FilterKeyMeta>();
  return new Map(metadataMap);
};
export const setFilterKeyMetaMapOnPrototype = (prototype: object, metadataMap: Map<string, FilterKeyMeta>) => {
  Reflect.defineMetadata("filterKey", new Map(metadataMap), prototype);
};

const getFilterArgMetasOnPrototype = (prototype: object, key: string): FilterArgMeta[] => {
  const filterArgMetas = (Reflect.getMetadata("filterArg", prototype, key) as FilterArgMeta[] | undefined) ?? [];
  return filterArgMetas;
};
export const setFilterArgMetasOnPrototype = (prototype: object, key: string, filterArgMetas: FilterArgMeta[]) => {
  Reflect.defineMetadata("filterArg", filterArgMetas, prototype, key);
};
export const getFilterArgMetas = (filterRef: Type, key: string) => {
  const filterArgMetas = getFilterArgMetasOnPrototype(filterRef.prototype as object, key);
  return filterArgMetas;
};

export const getFilterQuery = (filterRef: Type, key: string) => {
  const filterKeyMetaMap = getFilterKeyMetaMapOnPrototype(filterRef.prototype as object);
  const filterKeyMeta = filterKeyMetaMap.get(key);
  if (!filterKeyMeta?.descriptor.value) throw new Error(`filterKeyMeta is not defined for key: ${key}`);
  return filterKeyMeta.descriptor.value as (...args: any[]) => QueryOf<any>;
};
export const getFilterQueryMap = (filterRef: Type) => {
  const filterKeyMetaMap = getFilterKeyMetaMapOnPrototype(filterRef.prototype as object);
  return filterKeyMetaMap;
};
export const getFilterSort = (filterRef: Type, key: string) => {
  const filterMeta = getFilterMeta(filterRef);
  const sort = filterMeta.sort[key] as { [key: string]: any };
  return sort;
};
export const getFilterSortMap = (filterRef: Type) => {
  const filterMeta = getFilterMeta(filterRef);
  return filterMeta.sort;
};

export type BaseFilterSortKey = "latest" | "oldest";
export type BaseFilterQueryKey = "any";
export type BaseFilterKey = BaseFilterSortKey | BaseFilterQueryKey;

export interface FilterInstance<Query = unknown, Sort = unknown> {
  query: Query;
  sort: Sort;
}
interface BaseQuery<Model> {
  any: FilterInfo<[], [], Model>;
}
interface BaseSort {
  latest: { createdAt: -1 };
  oldest: { createdAt: 1 };
}

export type ExtractQuery<Filter extends FilterInstance> = {
  [K in keyof Filter["query"]]: Filter["query"][K] extends FilterInfo<any, infer Args>
    ? (...args: Args) => QueryOf<any>
    : never;
};
export type ExtractSort<Filter extends FilterInstance> = keyof Filter["sort"];

export const from = <
  Full extends BaseObject,
  BuildFilter extends (filter: () => FilterInfo<[], [], Full>) => FilterInstance,
  LibFilters extends Type[],
  _Filter extends ReturnType<BuildFilter>,
>(
  modelRef: Type<Full>,
  buildFilter: BuildFilter,
  ...libFilterRefs: LibFilters
) => {
  class Base {}
  const querySort = buildFilter(filter);
  Object.assign(Base.prototype, { latest: { createdAt: -1 }, oldest: { createdAt: 1 }, ...(querySort.sort as object) });
  Object.entries({
    any: filter().query(() => ({ removedAt: { $exists: false } })),
    ...(querySort.query as object),
  }).forEach(([key, filterInfo]) => {
    filterInfo.applyFilterMeta(Base, key);
  });
  setFilterMeta(Base, {
    refName: "Base",
    sort: Object.assign({ latest: { createdAt: -1 }, oldest: { createdAt: 1 } }, querySort.sort),
  });
  applyMixins(Base, libFilterRefs);
  const filterKeyMetaMap = getFilterKeyMetaMapOnPrototype(Base.prototype as object);
  libFilterRefs.forEach((libFilterRef) => {
    const libFilterKeyMetaMap = getFilterKeyMetaMapOnPrototype(libFilterRef.prototype as object);
    libFilterKeyMetaMap.forEach((value, key) => {
      const libFilterArgMetas = getFilterArgMetas(libFilterRef, key);
      filterKeyMetaMap.set(key, value);
      setFilterArgMetasOnPrototype(Base.prototype as object, key, libFilterArgMetas);
    });
  });
  return Base as unknown as Type<
    FilterInstance<
      BaseQuery<Full> & MergeAllKeyOfTypes<LibFilters, "query"> & _Filter["query"],
      BaseSort & MergeAllKeyOfTypes<LibFilters, "sort"> & _Filter["sort"]
    >
  >;
};

interface ArgProps<Value = any> {
  nullable?: boolean;
  ref?: string;
  default?: Value;
  renderOption?: (arg: any) => string;
}
export class FilterInfo<ArgNames extends string[] = [], Args extends any[] = [], Model = any> {
  readonly argNames: ArgNames = [] as unknown as ArgNames;
  readonly args: { name: string; argRef: any; option?: ArgProps }[];
  queryFn: ((...args: Args) => QueryOf<any>) | null = null;

  constructor() {
    this.args = [];
  }
  arg<
    ExplicitType,
    Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>,
    ArgName extends string = "unknown",
    _FieldToValue = FieldToValue<Arg>,
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
    _FieldToValue = FieldToValue<Arg>,
  >(name: ArgName, argRef: Arg, option?: Omit<ArgProps<_FieldToValue>, "nullable">) {
    if (this.queryFn) throw new Error("Query function is already set");
    this.argNames.push(name);
    this.args.push({ name, argRef, option: { ...option, nullable: true } });
    return this as unknown as FilterInfo<[...ArgNames, ArgName], [...Args, opt?: _FieldToValue | null], Model>;
  }
  query(query: (...args: Args) => QueryOf<Model>) {
    if (this.queryFn) throw new Error("Query function is already set");
    this.queryFn = query;
    return this;
  }
  applyFilterMeta(filterRef: Type, key: string) {
    const metadata: FilterKeyMeta = { key, type: "mongo", descriptor: { value: this.queryFn } };
    const metadataMap = getFilterKeyMetaMapOnPrototype(filterRef.prototype as object);
    metadataMap.set(key, metadata);
    (filterRef.prototype as object)[key] = this.queryFn;
    setFilterKeyMetaMapOnPrototype(filterRef.prototype as object, metadataMap);
    const filterArgMetas: FilterArgMeta[] = this.args.map((argInfo) => {
      const [modelRef, arrDepth] = getNonArrayModel(argInfo.argRef as Type);
      const [opt, optArrDepth] = getNonArrayModel(argInfo.option ?? {});
      return { name: argInfo.name, ...opt, modelRef, arrDepth, isArray: arrDepth > 0, optArrDepth };
    });
    setFilterArgMetasOnPrototype(filterRef.prototype as object, key, filterArgMetas);
  }
}

export const filter = () => new FilterInfo();
