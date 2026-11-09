import { describe, expect, test } from "bun:test";
import path from "node:path";
import { RouteJsBudget, type RouteJsSize } from "./routeJsBudget";
import { tempDirs, writeText as write } from "./testHelpers";

const makeTempRoot = tempDirs("akan-route-js-");
const size = (routeId: string, brotliKB: number): RouteJsSize => ({
  routeId,
  files: 1,
  rawBytes: brotliKB * 3 * 1024,
  brotliBytes: brotliKB * 1024,
});

describe("RouteJsBudget", () => {
  test("measures a route by the brotli sidecar of each file it loads, and a file with none by its raw bytes", async () => {
    const artifactDir = await makeTempRoot();
    await write(path.join(artifactDir, "client/rsc.js"), "r".repeat(3000));
    await write(path.join(artifactDir, "client/rsc.js.br"), "b".repeat(900));
    await write(path.join(artifactDir, "client/chunks/tiny.js"), "t".repeat(200));
    await write(path.join(artifactDir, "client/memo.js"), "m".repeat(5000));
    await write(path.join(artifactDir, "client/memo.js.br"), "b".repeat(1200));

    const sizes = await RouteJsBudget.measure(artifactDir, {
      "/:lang": ["/_akan/client/rsc.js", "/_akan/client/chunks/tiny.js"],
      "/:lang/memo": ["/_akan/client/rsc.js", "/_akan/client/chunks/tiny.js", "/_akan/client/memo.js"],
    });

    expect(sizes).toEqual([
      { routeId: "/:lang/memo", files: 3, rawBytes: 8200, brotliBytes: 2300 },
      { routeId: "/:lang", files: 2, rawBytes: 3200, brotliBytes: 1100 },
    ]);
  });

  test("fails only a route over its entry, and leaves a route without one to the report", () => {
    const budget = RouteJsBudget.parse(JSON.stringify({ routeJsBrotliKB: { "/:lang": 100, "/:lang/memo": 120 } }));
    const sizes = [size("/:lang", 100), { ...size("/:lang/memo", 120), brotliBytes: 120 * 1024 + 1 }, size("/x", 900)];

    expect(budget.overages(sizes)).toEqual([{ routeId: "/:lang/memo", brotliBytes: 120 * 1024 + 1, budgetKB: 120 }]);
    expect(budget.unbudgeted(sizes)).toEqual(["/x"]);
  });

  test("an update adds a new route, lowers an entry the route fits under, never raises one, and drops a gone route", () => {
    const committed = RouteJsBudget.parse(
      JSON.stringify({ routeJsBrotliKB: { "/:lang": 100, "/:lang/memo": 120, "/:lang/gone": 50 } }),
    );
    const updated = committed.tightenedBy([
      { ...size("/:lang", 90), brotliBytes: 90 * 1024 - 300 },
      size("/:lang/memo", 130),
      size("/:lang/new", 70),
    ]);

    expect(Object.fromEntries(updated.kbByRoute)).toEqual({ "/:lang": 90, "/:lang/memo": 120, "/:lang/new": 70 });
    expect(updated.stringify()).toBe(
      `{\n  "routeJsBrotliKB": {\n    "/:lang": 90,\n    "/:lang/memo": 120,\n    "/:lang/new": 70\n  }\n}\n`,
    );
  });

  test("refuses a file that is not a map of route ids to whole KB", () => {
    expect(() => RouteJsBudget.parse("{", "apps/shop/akan.budget.json")).toThrow(
      "apps/shop/akan.budget.json is not valid JSON.",
    );
    for (const text of ["{}", '{"routeJsBrotliKB":[]}', '{"routeJsBrotliKB":{"/":1.5}}', '{"routeJsBrotliKB":{"/":0}}'])
      expect(() => RouteJsBudget.parse(text)).toThrow('"routeJsBrotliKB" maps each route id to a whole number of KB.');
  });

  test("names each route over budget and how to resolve it", () => {
    expect(
      RouteJsBudget.formatOverages(
        [{ routeId: "/:lang/memo", brotliBytes: 125 * 1024, budgetKB: 120 }],
        "apps/shop/akan.budget.json",
      ),
    ).toBe(
      [
        "1 route over the JS budget in apps/shop/akan.budget.json:",
        "  /:lang/memo: 125.0KB brotli, over its 120KB",
        "Shrink what the route loads. If the growth is intended, raise its entry by hand in the same change.",
      ].join("\n"),
    );
  });
});
