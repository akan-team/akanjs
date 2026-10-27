import { describe, expect, test } from "bun:test";
import { Int } from "akanjs/base";
import { via } from "akanjs/constant";

import { type FilterSortOf, from, getFilterMeta } from ".";

type Equal<Left, Right> =
  (<Type>() => Type extends Left ? 1 : 2) extends <Type>() => Type extends Right ? 1 : 2 ? true : false;
type Expect<Type extends true> = Type;

const FilterMetaTestItemInput = via((f) => ({ x: f(Int), y: f(Int), z: f(Int) }));
const FilterMetaTestItemObject = via(FilterMetaTestItemInput, () => ({}));
const FilterMetaTestItemLight = via(FilterMetaTestItemObject, ["x"] as const, () => ({}));
const FilterMetaTestItem = via(FilterMetaTestItemObject, FilterMetaTestItemLight, () => ({}));

class BaseLibSortFilter extends from(FilterMetaTestItem, () => ({ query: {}, sort: { z: { z: 1 } } })) {}
class LibSortFilter extends from(
  FilterMetaTestItem,
  () => ({ query: {}, sort: { a: { x: -1 } } }),
  BaseLibSortFilter,
) {}
class AppSortFilter extends from(FilterMetaTestItem, () => ({ query: {}, sort: { b: { y: 1 } } }), LibSortFilter) {}
class RedeclaringSortFilter extends from(
  FilterMetaTestItem,
  () => ({ query: {}, sort: { a: { x: -1 }, b: { y: 1 } } }),
  LibSortFilter,
) {}

type AppSortKey = FilterSortOf<typeof AppSortFilter>;
type _LibFilterSortAssertions = [
  Expect<Equal<AppSortKey, "latest" | "oldest" | "relevance" | "z" | "a" | "b">>,
  Expect<Equal<FilterSortOf<typeof RedeclaringSortFilter>, AppSortKey>>,
];

describe("from", () => {
  test("merges every lib filter's sorts into the extending filter, in type and at runtime", () => {
    const sortKeys: AppSortKey[] = ["latest", "oldest", "relevance", "z", "a", "b"];
    // @ts-expect-error a sort key no filter in the chain declares
    const unknownSortKeys: AppSortKey[] = ["c"];

    expect(Object.keys(getFilterMeta(AppSortFilter).sort).sort()).toEqual([...sortKeys].sort());
    expect(Object.keys(getFilterMeta(AppSortFilter).sort)).not.toContain(unknownSortKeys[0]);
    expect(getFilterMeta(RedeclaringSortFilter).sort.a).toEqual({ x: -1 });
  });
});
