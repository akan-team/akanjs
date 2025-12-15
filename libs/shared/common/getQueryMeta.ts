import { ExtractQuery, FilterInfo, FilterInstance } from "@akanjs/document";

export class QueryMeta<Filter extends FilterInstance = any, Key = string, Args extends any[] = []> {
  refName: string;
  queryKey: Key;
  queryArgs: Args | (() => Args);

  constructor(refName: string) {
    this.refName = refName;
    this.queryArgs = [] as unknown as Args;
  }
  query<QueryKey extends keyof ExtractQuery<Filter>>(key: QueryKey) {
    this.queryKey = key as unknown as Key;
    return this as unknown as QueryMeta<
      Filter,
      Key,
      Filter["query"][QueryKey] extends FilterInfo<any, infer Args> ? Args : never
    >;
  }
  args(argFnOrArgs: Args | (() => Args)) {
    this.queryArgs = argFnOrArgs;
    return this;
  }
}

export const getQueryMeta = <Filter extends FilterInstance>(refName: string) => new QueryMeta<Filter>(refName);
