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

  test("fails only a route past its entry plus the larger of 1% and 4KB, and leaves a route without one to the report", () => {
    const budget = RouteJsBudget.parse(
      JSON.stringify({ routeJsBrotliKB: { "/:lang": 100, "/:lang/memo": 120, "/:lang/feed": 500 } }),
    );
    const sizes = [
      { ...size("/:lang", 100), brotliBytes: 100 * 1024 + 4096 },
      { ...size("/:lang/memo", 120), brotliBytes: 120 * 1024 + 4097 },
      { ...size("/:lang/feed", 500), brotliBytes: 500 * 1024 + 5000 },
      size("/x", 900),
    ];

    expect(RouteJsBudget.limitOf(500)).toBe(500 * 1024 + 5120);
    expect(budget.overages(sizes)).toEqual([
      { routeId: "/:lang/memo", brotliBytes: 120 * 1024 + 4097, budgetKB: 120, limitBytes: 120 * 1024 + 4096 },
    ]);
    expect(budget.unbudgeted(sizes)).toEqual(["/x"]);
  });

  test("an update adds a new route, lowers an entry the route fits under, never raises one, and drops a gone route", () => {
    const committed = RouteJsBudget.parse(
      JSON.stringify({ env: "main", routeJsBrotliKB: { "/:lang": 100, "/:lang/memo": 120, "/:lang/gone": 50 } }),
    );
    const updated = committed.tightenedBy(
      [
        { ...size("/:lang", 90), brotliBytes: 90 * 1024 - 300 },
        size("/:lang/memo", 130),
        size("/:lang/new", 70),
        size("/:lang/Zeta", 10),
      ],
      "local",
    );

    expect(Object.fromEntries(updated.kbByRoute)).toEqual({
      "/:lang": 90,
      "/:lang/memo": 120,
      "/:lang/new": 70,
      "/:lang/Zeta": 10,
    });
    expect(updated.stringify()).toBe(
      `{\n  "env": "local",\n  "routeJsBrotliKB": {\n    "/:lang": 90,\n    "/:lang/Zeta": 10,\n    "/:lang/memo": 120,\n    "/:lang/new": 70\n  }\n}\n`,
    );
  });

  test("names the environment a budget was recorded for when the build is for another", () => {
    const budget = RouteJsBudget.parse(JSON.stringify({ env: "main", routeJsBrotliKB: { "/:lang": 100 } }));

    expect(budget.envNote("main")).toBe("");
    expect(budget.envNote("local")).toBe(" (recorded for main, built for local)");
    expect(RouteJsBudget.parse(JSON.stringify({ routeJsBrotliKB: {} })).envNote("local")).toBe("");
  });

  test("refuses a file that is not a map of route ids to whole KB", () => {
    expect(() => RouteJsBudget.parse("{", "apps/shop/akan.budget.json")).toThrow(
      "apps/shop/akan.budget.json is not valid JSON.",
    );
    for (const text of ["{}", '{"routeJsBrotliKB":[]}', '{"routeJsBrotliKB":{"/":1.5}}', '{"routeJsBrotliKB":{"/":0}}'])
      expect(() => RouteJsBudget.parse(text)).toThrow('"routeJsBrotliKB" maps each route id to a whole number of KB.');
    expect(() => RouteJsBudget.parse('{"env":1,"routeJsBrotliKB":{}}')).toThrow('"env" names the environment');
  });

  describe("check", () => {
    const sizes = [{ ...size("/:lang/memo", 120), brotliBytes: 130 * 1024 }, size("/:lang/new", 70)];
    const setup = async (text?: string) => {
      const budgetPath = path.join(await makeTempRoot(), "akan.budget.json");
      if (text !== undefined) await write(budgetPath, text);
      return { budgetPath, source: "apps/shop/akan.budget.json", environment: "local" };
    };

    test("enforce fails a route over its limit and a file it cannot read", async () => {
      const over = await setup(JSON.stringify({ env: "main", routeJsBrotliKB: { "/:lang/memo": 120 } }));
      await expect(RouteJsBudget.check(sizes, { ...over, mode: "enforce" })).rejects.toThrow(
        "1 route over the JS budget in apps/shop/akan.budget.json (recorded for main, built for local):",
      );
      const broken = await setup("{");
      await expect(RouteJsBudget.check(sizes, { ...broken, mode: "enforce" })).rejects.toThrow("is not valid JSON");
    });

    test("report warns of an overage and a file it cannot read, and fails neither", async () => {
      const over = await setup(JSON.stringify({ env: "main", routeJsBrotliKB: { "/:lang/memo": 120 } }));
      expect(await RouteJsBudget.check(sizes, { ...over, mode: "report" })).toEqual({
        summary:
          "1 route(s) over apps/shop/akan.budget.json (recorded for main, built for local), reported only: /:lang/memo",
        warnings: [
          {
            file: "apps/shop/akan.budget.json",
            message:
              "/:lang/memo loads 133,120 bytes brotli, over its limit of 126,976 (recorded for main, built for local); akan build fails on it",
            fix: "shrink what the route loads, or raise its entry by hand in the same change",
          },
        ],
      });
      const broken = await setup("{");
      expect(await RouteJsBudget.check(sizes, { ...broken, mode: "report" })).toEqual({
        summary: "apps/shop/akan.budget.json is not valid JSON, not checked",
        warnings: [
          {
            file: "apps/shop/akan.budget.json",
            message: "apps/shop/akan.budget.json is not valid JSON; akan build fails on it",
            fix: "correct it, or rewrite it with akan build <app> --update-budget",
          },
        ],
      });
      expect(await RouteJsBudget.check(sizes, { ...(await setup()), mode: "report" })).toEqual({
        summary: "no akan.budget.json",
      });
      const within = await setup(JSON.stringify({ routeJsBrotliKB: { "/:lang/memo": 130 } }));
      expect(await RouteJsBudget.check(sizes, { ...within, mode: "report" })).toEqual({
        summary: "within apps/shop/akan.budget.json, 1 route(s) without an entry",
      });
    });

    test("update writes the file for this build's environment, rewriting one it cannot read", async () => {
      const broken = await setup("{");
      expect(await RouteJsBudget.check(sizes, { ...broken, mode: "update" })).toEqual({
        summary: "apps/shop/akan.budget.json rewritten (apps/shop/akan.budget.json is not valid JSON)",
      });
      const written = RouteJsBudget.parse(await Bun.file(broken.budgetPath).text());
      expect(written.env).toBe("local");
      expect(Object.fromEntries(written.kbByRoute)).toEqual({ "/:lang/memo": 130, "/:lang/new": 70 });
    });

    test("update keeps an entry its route outgrew, and still fails the route", async () => {
      const over = await setup(JSON.stringify({ routeJsBrotliKB: { "/:lang/memo": 120 } }));
      await expect(RouteJsBudget.check(sizes, { ...over, mode: "update" })).rejects.toThrow("/:lang/memo");
      expect(RouteJsBudget.parse(await Bun.file(over.budgetPath).text()).kbByRoute.get("/:lang/memo")).toBe(120);
    });
  });

  test("names each route over budget, its limit, and how to resolve it", () => {
    expect(
      RouteJsBudget.formatOverages(
        [{ routeId: "/:lang/memo", brotliBytes: 128_000, budgetKB: 120, limitBytes: 126_976 }],
        "apps/shop/akan.budget.json",
        " (recorded for main, built for local)",
      ),
    ).toBe(
      [
        "1 route over the JS budget in apps/shop/akan.budget.json (recorded for main, built for local):",
        "  /:lang/memo: 128,000 bytes brotli, over its limit of 126,976 (120KB + the larger of 1% and 4KB)",
        "Shrink what the route loads. If the growth is intended, raise its entry by hand in the same change.",
      ].join("\n"),
    );
  });
});
