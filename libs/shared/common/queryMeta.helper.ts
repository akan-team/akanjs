import type { FilterCls, FilterInfo, FilterInstance } from "akanjs/document";

export type AnyFilterShape = FilterInstance<Record<string, FilterInfo>, Record<string, unknown>>;
export type QueryMetaFilterShape<Filter> = Filter extends FilterInstance
  ? Filter
  : Filter extends FilterCls<infer FilterShape>
    ? FilterShape
    : Filter extends { query: Record<string, FilterInfo>; sort: Record<string, unknown> }
      ? Filter
      : AnyFilterShape;
export type QueryMetaFilterQuery<Filter> = QueryMetaFilterShape<Filter>["query"];
