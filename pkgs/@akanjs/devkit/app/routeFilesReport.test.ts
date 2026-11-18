import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { RouteFilesReport } from "./routeFilesReport";
import { RouteJsBudget } from "./routeJsBudget";

const write = async (file: string, text: string) => {
  await mkdir(path.dirname(file), { recursive: true });
  await Bun.write(file, text);
};

describe("RouteFilesReport", () => {
  test("lists each file once, sorted, with routes as ascending indexes whose served bytes sum to the budget's", async () => {
    const artifactDir = await mkdtemp(path.join(tmpdir(), "route-files-"));
    await write(path.join(artifactDir, "client/rsc.js"), "r".repeat(3000));
    await write(path.join(artifactDir, "client/rsc.js.br"), "b".repeat(900));
    await write(path.join(artifactDir, "client/chunks/tiny.js"), "t".repeat(200));
    await write(path.join(artifactDir, "client/memo.js"), "m".repeat(5000));
    await write(path.join(artifactDir, "client/memo.js.br"), "b".repeat(1200));
    const modulesByRoute = {
      "/:lang/memo": ["/_akan/client/memo.js", "/_akan/client/rsc.js", "/_akan/client/chunks/tiny.js"],
      "/:lang": ["/_akan/client/rsc.js", "/_akan/client/chunks/tiny.js"],
    };

    const sizeByUrl = await RouteJsBudget.fileSizes(artifactDir, modulesByRoute);
    const report = RouteFilesReport.build("demo", modulesByRoute, sizeByUrl);

    expect(report.files).toEqual([
      { file: "/_akan/client/chunks/tiny.js", rawBytes: 200, servedBytes: 200 },
      { file: "/_akan/client/memo.js", rawBytes: 5000, servedBytes: 1200 },
      { file: "/_akan/client/rsc.js", rawBytes: 3000, servedBytes: 900 },
    ]);
    expect(Object.keys(report.routes)).toEqual(["/:lang", "/:lang/memo"]);
    expect(report.routes).toEqual({ "/:lang": [0, 2], "/:lang/memo": [0, 1, 2] });
    for (const { routeId, brotliBytes, rawBytes } of RouteJsBudget.sizesOf(modulesByRoute, sizeByUrl)) {
      const indexes = report.routes[routeId] ?? [];
      expect(indexes.reduce((sum, index) => sum + (report.files[index]?.servedBytes ?? 0), 0)).toBe(brotliBytes);
      expect(indexes.reduce((sum, index) => sum + (report.files[index]?.rawBytes ?? 0), 0)).toBe(rawBytes);
    }
  });

  test("writes the same bytes for the same input and does not throw when the directory cannot be written", async () => {
    const appDir = await mkdtemp(path.join(tmpdir(), "route-files-app-"));
    const report = RouteFilesReport.build(
      "demo",
      { "/a": ["/_akan/x.js"] },
      new Map([["/_akan/x.js", { raw: 5, brotli: 4 }]]),
    );
    await RouteFilesReport.write(appDir, report);
    const first = await Bun.file(path.join(appDir, RouteFilesReport.file)).text();
    await RouteFilesReport.write(appDir, report);
    expect(await Bun.file(path.join(appDir, RouteFilesReport.file)).text()).toBe(first);
    expect(JSON.parse(first)).toEqual(report);

    await write(path.join(appDir, "blocked"), "");
    await RouteFilesReport.write(path.join(appDir, "blocked"), report);
  });
});
