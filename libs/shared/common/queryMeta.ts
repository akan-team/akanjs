import type { ExtractQuery, FilterInfo } from "akanjs/document";
import type { AnyFilterShape, QueryMetaFilterQuery, QueryMetaFilterShape } from "./queryMeta.helper";

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
