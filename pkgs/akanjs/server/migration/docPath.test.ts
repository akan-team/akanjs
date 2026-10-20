import { describe, expect, test } from "bun:test";
import { DocPath } from "./docPath";

describe("DocPath", () => {
  test("reads a missing path as an empty slot and a stored null as a value", () => {
    const doc = { profile: { tier: null }, tags: ["a", "b"] };
    expect(DocPath.read(doc, "profile.tier")).toEqual([null]);
    expect(DocPath.read(doc, "profile.name")).toEqual([]);
    expect(DocPath.read(doc, "tags.1")).toEqual(["b"]);
    expect(DocPath.read(doc, "tags.length")).toEqual([]);
  });

  test("writes through missing parents, into an array up to its end, and never through a scalar", () => {
    const doc: Record<string, unknown> = { name: "Kenny", tags: ["a"] };
    DocPath.write(doc, "profile.tier", "gold");
    DocPath.write(doc, "tags.1", "b");
    DocPath.write(doc, "joinedAt", new Date(1_700_000_000_000));
    expect(doc).toEqual({ name: "Kenny", tags: ["a", "b"], profile: { tier: "gold" }, joinedAt: 1_700_000_000_000 });
    expect(() => DocPath.write(doc, "name.first", "K")).toThrow('"name" holds a string');
    expect(() => DocPath.write(doc, "tags.5", "z")).toThrow("not an index within the array");
  });

  test("removes a key but not an array item, whose later indexes would shift", () => {
    const doc: Record<string, unknown> = { profile: { tier: "gold" }, tags: ["a"] };
    DocPath.remove(doc, "profile.tier");
    DocPath.remove(doc, "missing.deep");
    expect(doc).toEqual({ profile: {}, tags: ["a"] });
    expect(() => DocPath.remove(doc, "tags.0")).toThrow("inside an array");
  });

  test("refuses empty and prototype segments", () => {
    expect(() => DocPath.read({}, "a..b")).toThrow("Invalid document path");
    expect(() => DocPath.write({}, "__proto__.polluted", true)).toThrow("Invalid document path");
    expect(() => DocPath.write({}, "a.constructor", true)).toThrow("Invalid document path");
  });

  test("compares slots by value, key order aside", () => {
    expect(DocPath.same([{ a: 1, b: [2] }], [{ b: [2], a: 1 }])).toBe(true);
    expect(DocPath.same([null], [])).toBe(false);
    expect(DocPath.same([], [])).toBe(true);
  });

  test("refuses paths of one write that sit inside one another", () => {
    expect(() => DocPath.assertDisjoint(["a", "a-b", "a.z"])).toThrow('"a" and "a.z" overlap');
    expect(() => DocPath.assertDisjoint(["a", "ab", "a-b"])).not.toThrow();
  });
});
