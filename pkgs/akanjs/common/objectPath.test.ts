import { describe, expect, test } from "bun:test";

import dayjs from "dayjs";

import { applyMixins, deepObjectify, getAllPropertyDescriptors, isQueryEqual, objectify, pathGet, pathSet } from ".";

class ParentFixture {
  get parentValue() {
    return "parent";
  }

  parentMethod() {
    return "parent method";
  }
}

class ChildFixture extends ParentFixture {
  childMethod() {
    return "child method";
  }
}

class TargetFixture {}

describe("object and path helpers", () => {
  test("gets nested values with fallback support", () => {
    const obj = { user: { profile: { name: "Akan" }, tags: ["core"] } };

    expect(pathGet("user.profile.name", obj)).toBe("Akan");
    expect(pathGet(["user", "tags", 0], obj)).toBe("core");
    expect(pathGet("user.profile.age", obj, ".", "unknown")).toBe("unknown");
    expect(pathGet("user.profile.name", null, ".", "unknown")).toBe("unknown");
  });

  test("sets nested object and array paths in place", () => {
    const obj: Record<string, unknown> = {};

    expect(pathSet(obj, "user.profile.name", "Akan")).toBe(obj);
    expect(obj).toEqual({ user: { profile: { name: "Akan" } } });

    pathSet(obj, ["items", 0, "id"], "first");
    expect(obj).toEqual({
      user: { profile: { name: "Akan" } },
      items: [{ id: "first" }],
    });
  });

  test("objectifies own data fields and skips functions", () => {
    const source = {
      id: "1",
      name: "Akan",
      greet() {
        return "hello";
      },
    };

    expect(objectify(source)).toEqual({ id: "1", name: "Akan" });
    expect(objectify(source, ["name"])).toEqual({ name: "Akan" });
  });

  test("deep objectifies arrays, dates, dayjs values, and model-like values", () => {
    const date = new Date("2025-01-01T00:00:00.000Z");
    const modelLike = { __ModelType__: "User", id: "u1" };
    const source = {
      date,
      day: dayjs(date),
      nested: [{ id: "a", run: () => "skip" }],
      modelLike,
    };

    expect(deepObjectify(source)).toEqual({
      date,
      day: dayjs(date),
      nested: [{ id: "a" }],
      modelLike,
    });
    expect(deepObjectify(source, { serializable: true, convertDate: "string" })).toEqual({
      date: "2025-01-01T00:00:00.000Z",
      day: "2025-01-01T00:00:00.000Z",
      nested: [{ id: "a" }],
      modelLike: { __ModelType__: "User", id: "u1" },
    });
    expect(deepObjectify(date, { convertDate: "number" })).toBe(date.getTime());
  });

  test("compares query values deeply including dates", () => {
    expect(isQueryEqual({ a: 1, b: ["x", "y"] }, { a: 1, b: ["x", "y"] })).toBe(true);
    expect(isQueryEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(isQueryEqual([dayjs("2025-01-01")], [new Date("2025-01-01T00:00:00.000Z")])).toBe(true);
    expect(isQueryEqual(null, null)).toBe(true);
    expect(isQueryEqual(null, {})).toBe(false);
  });

  test("collects inherited descriptors and applies mixins", () => {
    const descriptors = getAllPropertyDescriptors(ChildFixture);

    expect(descriptors.childMethod).toBeDefined();
    expect(descriptors.parentMethod).toBeDefined();
    expect(descriptors.parentValue?.get).toBeDefined();

    applyMixins(TargetFixture, [ChildFixture], new Set(["parentMethod"]));
    const mixed = new TargetFixture() as TargetFixture & ChildFixture;

    expect(mixed.childMethod()).toBe("child method");
    expect((mixed as TargetFixture & ParentFixture).parentValue).toBe("parent");
    expect("parentMethod" in mixed).toBe(false);
  });
});
