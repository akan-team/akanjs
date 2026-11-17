import { describe, expect, test } from "bun:test";
import { DictionaryPacking } from "./dictionaryPacking";

const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const manyModules = () => {
  const random = seeded(7);
  const groups = Array.from({ length: 80 }, (_, idx) => `module${idx}`);
  const routes = new Map<string, string[]>();
  for (let idx = 0; idx < 300; idx++) {
    const shown = groups.filter(() => random() < 0.12);
    routes.set(`/:lang/route${idx}`, ["base", ...shown]);
  }
  routes.set("/:lang/everything", ["base", ...groups]);
  const sizes = new Map(["base", ...groups].map((group) => [group, 200 + Math.floor(random() * 6000)]));
  return { groups: ["base", ...groups, "unshown"], routes, bytesOf: (group: string) => sizes.get(group) ?? 100 };
};

const filesOf = (routeId: string, { partsByRoute }: ReturnType<typeof DictionaryPacking.pack>) =>
  partsByRoute[routeId] ?? [];

describe("DictionaryPacking", () => {
  test("loads every route's groups in at most four files, over a workspace of many modules", () => {
    const { groups, routes, bytesOf } = manyModules();
    const pack = DictionaryPacking.pack(routes, bytesOf, groups);

    for (const [routeId, shown] of routes) {
      const files = filesOf(routeId, pack);
      expect(files.length).toBeLessThanOrEqual(DictionaryPacking.bound);
      const held = new Set(files.flatMap((idx) => pack.parts[idx] ?? []));
      for (const group of shown) expect(held.has(group)).toBe(true);
    }
  });

  test("puts each group in one file, and a group no route shows in the last, which no route loads", () => {
    const { groups, routes, bytesOf } = manyModules();
    const pack = DictionaryPacking.pack(routes, bytesOf, groups);

    expect(pack.parts.flat().sort()).toEqual([...groups].sort());
    expect(pack.parts.at(-1)).toEqual(["unshown"]);
    const last = pack.parts.length - 1;
    for (const files of Object.values(pack.partsByRoute)) expect(files).not.toContain(last);
  });

  test("keeps apart groups that routes take apart when merging them would cost more than a request", () => {
    const routes = new Map([
      ["/:lang/a", ["base", "big"]],
      ["/:lang/b", ["base", "other"]],
    ]);
    const bytesOf = (group: string) => (group === "base" ? 9000 : 8000);
    const pack = DictionaryPacking.pack(routes, bytesOf, ["base", "big", "other"]);

    expect(pack.parts).toEqual([["base"], ["big"], ["other"]]);
    expect(pack.partsByRoute).toEqual({ "/:lang/a": [0, 1], "/:lang/b": [0, 2] });
  });

  test("merges small files every route takes together, as a request costs more than their bytes", () => {
    const routes = new Map([
      ["/:lang/a", ["base", "tiny"]],
      ["/:lang/b", ["base", "tiny", "small"]],
    ]);
    const bytesOf = (group: string) => (group === "base" ? 9000 : 40);
    const pack = DictionaryPacking.pack(routes, bytesOf, ["base", "small", "tiny"]);

    expect(pack.parts).toEqual([["base", "small", "tiny"]]);
    expect(pack.partsByRoute).toEqual({ "/:lang/a": [0], "/:lang/b": [0] });
  });

  test("a second route reuses the files the first one loaded where they share groups", () => {
    const routes = new Map([
      ["/:lang/memo", ["base", "memo", "user"]],
      ["/:lang/memo/:memoId", ["base", "memo", "user", "comment"]],
    ]);
    const bytesOf = () => 5000;
    const pack = DictionaryPacking.pack(routes, bytesOf, ["base", "comment", "memo", "user"]);
    const first = filesOf("/:lang/memo", pack);
    const second = filesOf("/:lang/memo/:memoId", pack);

    expect(second.filter((idx) => !first.includes(idx)).flatMap((idx) => pack.parts[idx] ?? [])).toEqual(["comment"]);
  });
});
