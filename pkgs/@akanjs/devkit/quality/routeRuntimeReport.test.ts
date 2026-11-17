import { describe, expect, test } from "bun:test";
import path from "node:path";
import { tempDirs, writeText } from "../test/testHelpers";
import { type RouteRuntimeBuildReport, RouteRuntimeReport } from "./routeRuntimeReport";

const makeTempRoot = tempDirs("akan-devkit-route-runtime-report-");

const report: RouteRuntimeBuildReport = {
  app: "demo",
  routes: 12,
  perModule: ["/memo"],
  notSmaller: ["/board", "/board/:id"],
  refused: ["/tally"],
  causes: [
    {
      rule: "reader",
      file: "apps/demo/ui/Pick.tsx",
      line: 7,
      message: "`st.use[name]`: the name is picked at run time",
      entries: ["apps/demo/ui/Pick.tsx", "apps/demo/ui/Frame.tsx"],
      routes: ["/a", "/b", "/c", "/d", "/e", "/f", "/g", "/h", "/i"],
      chains: [["apps/demo/ui/Frame.tsx", "apps/demo/ui/Pick.tsx"]],
    },
    {
      rule: "not-smaller",
      message: "/board is 950 B loading per module and 900 B with the whole runtime",
      entries: ["apps/demo/ui/Board.tsx"],
      routes: ["/board", "/board/:id"],
      chains: [],
    },
    { rule: "unheld", message: "no page loading per module holds it", entries: ["a", "b"], routes: [], chains: [] },
  ],
};

describe("what a clientRuntime route build decided, as akan quality runtime prints it", () => {
  test("the build's one line counts the routes per module, the ones measured no smaller, and the ones kept for a named reason", () => {
    expect(RouteRuntimeReport.summary(report)).toBe(
      "1 route loads per module, 2 keep the whole runtime because per module would not be smaller, 9 keep it for a reason `akan quality runtime` names",
    );
    expect(RouteRuntimeReport.summary({ ...report, routes: 3 })).toBe(
      "1 route loads per module, 2 keep the whole runtime because per module would not be smaller",
    );
  });

  test("every reason names its file and line or its rule, the entries and routes it holds, and how the file is reached", () => {
    expect(RouteRuntimeReport.format([report]).split("\n")).toEqual([
      'Last build of apps/demo under clientRuntime: "route": 1 route loads per module, 2 keep the whole runtime because per module would not be smaller, 9 keep it for a reason `akan quality runtime` names.',
      "  per module: /memo",
      "  [reader] apps/demo/ui/Pick.tsx:7 `st.use[name]`: the name is picked at run time",
      "    2 entries on 9 routes: /a, /b, /c, /d, /e, /f, and 3 more",
      "    reached as apps/demo/ui/Frame.tsx → apps/demo/ui/Pick.tsx",
      "  [not-smaller] /board is 950 B loading per module and 900 B with the whole runtime",
      "    1 entry on 2 routes: /board, /board/:id",
      "  [unheld] no page loading per module holds it",
      "    2 entries on 0 routes",
      "  1 route measured no smaller per module than where every page keeps the whole runtime, and larger still keeping it here, so it loads per module: /tally",
    ]);
    const many = { ...report, perModule: ["/a", "/b", "/c", "/d", "/e", "/f", "/g", "/h"], causes: [], refused: [] };
    expect(RouteRuntimeReport.format([many]).split("\n")[1]).toBe("  per module: /a, /b, /c, /d, /e, /f, and 2 more");
    expect(RouteRuntimeReport.format([])).toBe("");
  });

  test("a build's report is read back from every app that has one, a file that is not a report left out", async () => {
    const root = await makeTempRoot();
    await RouteRuntimeReport.write(path.join(root, "apps/demo"), report);
    await writeText(path.join(root, "apps/other", RouteRuntimeReport.file), "{}\n");
    expect(await RouteRuntimeReport.read(root)).toEqual([report]);
  });

  test("a route that loads every text of the page dictionary is listed under the file and line that cost it", async () => {
    const root = await makeTempRoot();
    const appDir = path.join(root, "apps/demo");
    const dictionary = [
      { file: "apps/demo/ui/Label.tsx", line: 4, why: "`l(key)`: the key is picked at run time", routes: ["/a", "/b"] },
      { file: "apps/demo/ui/Pick.tsx", why: "needs every module's client runtime", routes: ["/c"] },
    ];
    await RouteRuntimeReport.addDictionary(appDir, dictionary);
    expect(await RouteRuntimeReport.read(root)).toEqual([]);

    await RouteRuntimeReport.write(appDir, { ...report, causes: [], refused: [] });
    await RouteRuntimeReport.addDictionary(appDir, dictionary);
    const reports = await RouteRuntimeReport.read(root);
    expect(reports[0]?.dictionary).toEqual(dictionary);
    expect(RouteRuntimeReport.format(reports).split("\n").slice(2)).toEqual([
      "  [dictionary] apps/demo/ui/Label.tsx:4 `l(key)`: the key is picked at run time",
      "    2 routes load every text of the page dictionary: /a, /b",
      "  [dictionary] apps/demo/ui/Pick.tsx needs every module's client runtime",
      "    1 route loads every text of the page dictionary: /c",
    ]);
  });
});
