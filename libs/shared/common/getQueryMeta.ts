import type { ExtractQuery, FilterCls, FilterInfo, FilterInstance } from "akanjs/document";

type AnyFilterShape = FilterInstance<Record<string, FilterInfo>, Record<string, unknown>>;
type QueryMetaFilterShape<Filter> = Filter extends FilterInstance
  ? Filter
  : Filter extends FilterCls<infer FilterShape>
    ? FilterShape
    : Filter extends { query: Record<string, FilterInfo>; sort: Record<string, unknown> }
      ? Filter
      : AnyFilterShape;
type QueryMetaFilterQuery<Filter> = QueryMetaFilterShape<Filter>["query"];

export class QueryMeta<Filter = AnyFilterShape, Key = string, Args extends unknown[] = []> {
  refName: string;
  queryKey: Key | null = null;
  queryArgs: Args | (() => Args);

  constructor(refName: string) {
    this.refName = refName;
    this.queryArgs = [] as unknown as Args;
  }
  query<QueryKey extends keyof ExtractQuery<QueryMetaFilterShape<Filter>>>(key: QueryKey) {
    this.queryKey = key as unknown as Key;
    return this as unknown as QueryMeta<
      Filter,
      Key,
      QueryMetaFilterQuery<Filter>[QueryKey] extends FilterInfo<infer _ArgNames, infer Args> ? Args : never
    >;
  }
  args(argFnOrArgs: Args | (() => Args)) {
    this.queryArgs = argFnOrArgs;
    return this;
  }
}

export const getQueryMeta = <Filter = AnyFilterShape>(refName: string) => new QueryMeta<Filter>(refName);
