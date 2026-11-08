import { describe, expect, test } from "bun:test";
import { Any, enumOf, Int } from "akanjs/base";
import { via } from "akanjs/constant";

import {
  DEFAULT_FILTER_ARG_MAX_ITEMS,
  FilterQueryError,
  type FilterSortOf,
  from,
  getFilterInfoByKey,
  getFilterMeta,
  getFilterSortByKey,
  resolveFilterQuery,
} from ".";

type Equal<Left, Right> =
  (<Type>() => Type extends Left ? 1 : 2) extends <Type>() => Type extends Right ? 1 : 2 ? true : false;
type Expect<Type extends true> = Type;

class FilterMetaTestStatus extends enumOf("filterMetaTestStatus", ["draft", "active"] as const) {}
const FilterMetaTestItemInput = via((f) => ({ x: f(Int), y: f(Int), z: f(Int), status: f(FilterMetaTestStatus) }));
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

class ArgFilter extends from(FilterMetaTestItem, (filter) => ({
  query: {
    byStatus: filter()
      .arg("status", FilterMetaTestStatus)
      .query((status) => ({ status })),
    inX: filter()
      .arg("xs", [Int])
      .query((xs, q) => ({ x: q.oneOf(xs) })),
    inManyX: filter()
      .arg("xs", [Int], { maxItems: 5000 })
      .query((xs, q) => ({ x: q.oneOf(xs) })),
  },
  sort: { byX: { x: 1 } },
})) {}
const ints = (count: number) => Array.from({ length: count }, (_, idx) => idx);

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

describe("resolveFilterQuery", () => {
  test("parses an enum arg against its values, so a value outside them is refused", () => {
    expect(resolveFilterQuery(ArgFilter, "byStatus", ["active"])).toEqual({ status: "active" });
    expect(() => resolveFilterQuery(ArgFilter, "byStatus", ["archived"])).toThrow(FilterQueryError);
    expect(() => resolveFilterQuery(ArgFilter, "byStatus", [{ ne: "draft" }])).toThrow("expected a single value");
  });

  test("refuses an object for a primitive arg and a lone value for a list arg, rather than coercing either", () => {
    expect(() => resolveFilterQuery(ArgFilter, "inX", [3])).toThrow("expected a list");
    expect(() => resolveFilterQuery(ArgFilter, "inX", [[1, { gte: 0 }]])).toThrow("expected a single value");
    expect(() => resolveFilterQuery(ArgFilter, "inX", [[[1]]])).toThrow("expected a single value");
    expect(resolveFilterQuery(ArgFilter, "inX", [["1", 2]])).toEqual({ x: { kind: "op", op: "oneOf", value: [1, 2] } });
  });

  test("takes a list arg up to its item limit, which the declaration may raise", () => {
    expect(resolveFilterQuery(ArgFilter, "inX", [ints(DEFAULT_FILTER_ARG_MAX_ITEMS)])).toEqual({
      x: { kind: "op", op: "oneOf", value: ints(DEFAULT_FILTER_ARG_MAX_ITEMS) },
    });
    expect(() => resolveFilterQuery(ArgFilter, "inX", [ints(DEFAULT_FILTER_ARG_MAX_ITEMS + 1)])).toThrow(
      `takes at most ${DEFAULT_FILTER_ARG_MAX_ITEMS} items`,
    );
    expect(resolveFilterQuery(ArgFilter, "inManyX", [ints(5000)])).toEqual({
      x: { kind: "op", op: "oneOf", value: ints(5000) },
    });
    expect(() => resolveFilterQuery(ArgFilter, "inManyX", [ints(5001)])).toThrow(FilterQueryError);
  });

  test("names a filter or a sort only by the filter's own keys", () => {
    for (const key of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(getFilterSortByKey(ArgFilter, key)).toBeUndefined();
      expect(() => resolveFilterQuery(ArgFilter, key)).toThrow(FilterQueryError);
      expect(() => getFilterInfoByKey(ArgFilter, key)).toThrow(`queryMeta is not defined for key: ${key}`);
    }
    expect(getFilterSortByKey(ArgFilter, "byX")).toEqual({ x: 1 });
  });

  test("refuses a filter arg declared as Any, whose value the caller would shape", () => {
    const declare = (argRef: typeof Any | [typeof Any]) =>
      from(FilterMetaTestItem, (filter) => ({
        query: {
          open: filter()
            .arg("value", argRef)
            .query(() => ({})),
        },
        sort: {},
      }));
    const declareOptional = () =>
      from(FilterMetaTestItem, (filter) => ({
        query: {
          open: filter()
            .opt("value", Any)
            .query(() => ({})),
        },
        sort: {},
      }));

    expect(() => declare(Any)).toThrow('Filter argument "value" is declared as Any');
    expect(() => declare([Any])).toThrow('Filter argument "value" is declared as Any');
    expect(declareOptional).toThrow('Filter argument "value" is declared as Any');
  });
});
