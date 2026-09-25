import { describe, expect, test } from "bun:test";
import { Int } from "akanjs/base";
import { ConstantRegistry } from "./constantRegistry";
import { fieldQueryMetaOf } from "./fieldQueryMeta";
import { via } from "./via";

const Input = via((f) => ({
  active: f(Int, { default: 0 }).meta({ refName: "user", queryKey: "byStatuses", queryArgs: [["active"]] }),
  hourly: f(Int, { default: 0 }).meta({ refName: "user", queryKey: "byLoginAt", queryArgs: () => ["now"] }),
  unkeyed: f(Int, { default: 0 }).meta({ refName: "user", queryKey: null }),
  labelled: f(Int, { default: 0 }).meta({ unit: "count" }),
  plain: f(Int, { default: 0 }),
}));
const Obj = via(Input, () => ({}));
const Light = via(Obj, ["active"] as const, () => ({}));
const Full = via(Obj, Light, () => ({}));
const Insight = via(Full, (f) => ({ count: f(Int, { default: 0 }) }));
ConstantRegistry.buildModel("fieldQueryMetaSummary", Input, Obj, Full, Light, Insight, {});

describe("fieldQueryMetaOf", () => {
  test("reads the query a field declares, args and thunk alike", () => {
    expect(fieldQueryMetaOf("fieldQueryMetaSummary", "active")).toEqual({
      refName: "user",
      queryKey: "byStatuses",
      queryArgs: [["active"]],
    });
    expect(typeof fieldQueryMetaOf("fieldQueryMetaSummary", "hourly")?.queryArgs).toBe("function");
    // A field may name its model before it names a query; the caller decides what an unkeyed one means.
    expect(fieldQueryMetaOf("fieldQueryMetaSummary", "unkeyed")?.queryKey).toBeNull();
  });

  test("ignores metadata that is not a query, and a field or model that declares none", () => {
    expect(fieldQueryMetaOf("fieldQueryMetaSummary", "labelled")).toBeUndefined();
    expect(fieldQueryMetaOf("fieldQueryMetaSummary", "plain")).toBeUndefined();
    expect(fieldQueryMetaOf("fieldQueryMetaSummary", "absent")).toBeUndefined();
    // An app with no summary model at all asks the same question and gets the same answer, not a throw.
    expect(fieldQueryMetaOf("summary", "active")).toBeUndefined();
  });
});
