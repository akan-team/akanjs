import { describe, expect, test } from "bun:test";
import { formatWithBiome, hasBiome } from "../test/testHelpers";
import { JsonFormatter } from "./jsonFormatter";

const pad = (length: number) => "x".repeat(length);
const thousands = Array.from({ length: 40 }, (_, idx) => idx * 1000);

const fixtures: Record<string, unknown> = {
  collapsed: { scalars: ["accessToken", "accessLog"], empty: [], none: {}, nested: [["a"], [{}]] },
  commaAtTheEdge: { a: [pad(108)], b: [pad(109)], c: [pad(109)] },
  objectsInArray: { routes: [{ path: "/" }, { path: "/a" }] },
  numbers: { sizes: thousands, words: thousands.map(String) },
  wide: { a: ["한".repeat(54)], b: ["한".repeat(55)] },
  rootArray: [pad(60), pad(60)],
};

describe("JsonFormatter", () => {
  test("collapses an array that fits the line with its trailing comma, and keeps every object expanded", () => {
    expect(JsonFormatter.stringify(fixtures.collapsed, "akan.lib.json")).toBe(
      '{\n  "scalars": ["accessToken", "accessLog"],\n  "empty": [],\n  "none": {},\n  "nested": [["a"], [{}]]\n}\n',
    );
    expect(JsonFormatter.stringify(fixtures.commaAtTheEdge, "akan.lib.json").split("\n")).toEqual([
      "{",
      `  "a": ["${pad(108)}"],`,
      '  "b": [',
      `    "${pad(109)}"`,
      "  ],",
      `  "c": ["${pad(109)}"]`,
      "}",
      "",
    ]);
    expect(JsonFormatter.stringify(fixtures.objectsInArray, "akan.lib.json")).toContain('"routes": [\n    {\n');
  });

  test("fills an array of numbers that overflows, and keeps any other overflowing array one item a line", () => {
    const [, sizesOpen, firstRow, secondRow] = JsonFormatter.stringify(fixtures.numbers, "akan.app.json").split("\n");
    expect(sizesOpen).toBe('  "sizes": [');
    expect(firstRow).toStartWith("    0, 1000, 2000,");
    expect(firstRow?.length).toBeLessThanOrEqual(JsonFormatter.lineWidth);
    expect(secondRow).toStartWith("    18000,");
    expect(JsonFormatter.stringify(fixtures.numbers, "akan.app.json")).toContain('"words": [\n    "0",\n    "1000",');
  });

  test("measures a wide character as two columns", () => {
    const [, fits, overflows] = JsonFormatter.stringify(fixtures.wide, "akan.lib.json").split("\n");
    expect(fits).toBe(`  "a": ["${"한".repeat(54)}"],`);
    expect(overflows).toBe('  "b": [');
  });

  test("keeps a package.json expanded the way JSON.stringify writes it", () => {
    const manifest = { name: "x", workspaces: ["pkgs/*"], dependencies: {} };
    expect(JsonFormatter.stringify(manifest, "libs/x/package.json")).toBe(`${JSON.stringify(manifest, null, 2)}\n`);
  });

  test.skipIf(!hasBiome)("prints what Biome prints", async () => {
    expect(await formatWithBiome('{"a":[1]}', "libs/fixture/akan.lib.json")).toBe('{ "a": [1] }\n');
    for (const [name, fixture] of Object.entries(fixtures)) {
      const printed = JsonFormatter.stringify(fixture, `libs/fixture/${name}.json`);
      expect(await formatWithBiome(printed, `libs/fixture/${name}.json`)).toBe(printed);
    }
    const manifest = JsonFormatter.stringify({ name: "x", workspaces: ["a", "b"] }, "package.json");
    expect(await formatWithBiome(manifest, "libs/fixture/package.json")).toBe(manifest);
  });
});
