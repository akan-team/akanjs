import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Logger } from "akanjs/common";
import { tempDirs } from "../test/testHelpers";
import { ApplicationBuildReporter, type ApplicationBuildResult } from "./applicationBuildReporter";

const tempRoot = tempDirs("akan-devkit-build-reporter-");

const resultFor = (environment: string): ApplicationBuildResult => ({
  phases: [],
  durationMs: 1_200,
  outputDir: "dist/apps/shop",
  artifactDir: "dist/apps/shop/.akan/artifact",
  environment,
});

describe("ApplicationBuildReporter.printSummary", () => {
  const rawLog = spyOn(Logger, "rawLog").mockImplementation(() => undefined);
  afterEach(() => rawLog.mockClear());

  test("names the flag and the variables a deployed build needs when the build is for local", () => {
    ApplicationBuildReporter.printSummary(resultFor("local"));

    const notice = rawLog.mock.calls.map(([line]) => line).at(-1);
    expect(notice).toBe(ApplicationBuildReporter.localBuildNotice);
    for (const part of ["akan build <app> --env main", "AKAN_PUBLIC_REPO_NAME", "AKAN_PUBLIC_SERVE_DOMAIN"])
      expect(notice).toContain(part);
    expect(notice).not.toContain("dev routes");
  });

  test("adds nothing to a build for a deployed environment", () => {
    ApplicationBuildReporter.printSummary(resultFor("main"));

    expect(rawLog.mock.calls.map(([line]) => line)).not.toContain(ApplicationBuildReporter.localBuildNotice);
    expect(rawLog.mock.calls.at(-1)?.[0]).toBe("Done in 1.2s");
  });

  test("lists the largest routes' JS before the paths, and how many more it left out", () => {
    const routeJs = Array.from({ length: 12 }, (_, idx) => ({
      routeId: `/:lang/r${idx}`,
      files: 3,
      rawBytes: (12 - idx) * 3 * 1024,
      brotliBytes: (12 - idx) * 1024,
    }));
    ApplicationBuildReporter.printSummary({ ...resultFor("main"), routeJs });

    const lines = rawLog.mock.calls.map(([line]) => line);
    expect(lines.slice(1, 4)).toEqual([
      "Route JS, largest first (brotli / raw):",
      "  /:lang/r0    12.0KB    36.0KB",
      "  /:lang/r1    11.0KB    33.0KB",
    ]);
    expect(lines).toContain("  …and 2 more");
    expect(lines.indexOf("  …and 2 more")).toBeLessThan(
      lines.indexOf("Route artifacts: dist/apps/shop/.akan/artifact"),
    );
  });

  test("prints each locale's dictionary size, and its API description file's where the build split one out", async () => {
    const artifactDir = await tempRoot();
    await mkdir(path.join(artifactDir, "dict"));
    await writeFile(path.join(artifactDir, "dict/en.js"), "x".repeat(4096));
    await writeFile(path.join(artifactDir, "dict/en.js.br"), "x".repeat(1100));
    await writeFile(path.join(artifactDir, "dict/en-api.js"), "y");
    await writeFile(path.join(artifactDir, "dict/ko.js"), "z");
    const dictAssets = {
      en: {
        url: "/_akan/dict/en.js",
        relPath: "dict/en.js",
        parts: { api: { url: "/_akan/dict/en-api.js", relPath: "dict/en-api.js" } },
      },
      ko: { url: "/_akan/dict/ko.js", relPath: "dict/ko.js" },
    };
    await writeFile(path.join(artifactDir, "base-artifact.json"), JSON.stringify({ dictAssets }));
    ApplicationBuildReporter.printSummary({ ...resultFor("main"), artifactDir });

    const lines = rawLog.mock.calls.map(([line = ""]) => line);
    const en = lines.find((line) => line.startsWith("Dictionary en:"));
    expect(en).toMatch(/^Dictionary en: 1\.1KB brotli on every page, API descriptions \d+B where shown$/);
    expect(lines.find((line) => line.startsWith("Dictionary ko:"))).toMatch(
      /^Dictionary ko: \d+B brotli on every page$/,
    );
    expect(lines.indexOf(en ?? "")).toBeLessThan(lines.indexOf(`Route artifacts: ${artifactDir}`));
  });

  test("prints only the route JS budget warnings for a quiet build", () => {
    const routeJsWarnings = [{ file: "apps/shop/akan.budget.json", message: "unreadable", fix: "correct it" }];
    ApplicationBuildReporter.printRouteJsWarnings({ routeJsWarnings });
    ApplicationBuildReporter.printRouteJsWarnings({});

    expect(rawLog.mock.calls.map(([line]) => line)).toEqual([
      "Warning: apps/shop/akan.budget.json: unreadable (correct it)",
    ]);
  });

  test("prints each route JS budget warning of a build that only reports it", () => {
    const routeJsWarnings = [
      { file: "apps/shop/akan.budget.json", message: "/:lang/memo loads 133,120 bytes brotli", fix: "shrink it" },
    ];
    ApplicationBuildReporter.printSummary({ ...resultFor("main"), routeJsWarnings });

    expect(rawLog.mock.calls.map(([line]) => line)).toContain(
      "Warning: apps/shop/akan.budget.json: /:lang/memo loads 133,120 bytes brotli (shrink it)",
    );
  });
});

describe("ApplicationBuildReporter.create", () => {
  const rawLog = spyOn(Logger, "rawLog").mockImplementation(() => undefined);
  afterEach(() => rawLog.mockClear());

  test("prints one uncoloured line per finished phase and nothing when one starts, and a failed one to stderr", () => {
    const reporter = ApplicationBuildReporter.create();
    reporter.phaseStart?.({ id: "ssr", label: "Building SSR route artifacts" });
    reporter.phaseDone?.({ id: "ssr", label: "Building SSR route artifacts", durationMs: 3_100, summary: "2 routes" });
    reporter.phaseFail?.({ id: "csr", label: "Building CSR assets" }, new Error("boom"));

    expect(rawLog.mock.calls).toEqual([
      ["✓ Building SSR route artifacts: 2 routes (3.1s)"],
      ["✗ Building CSR assets failed", undefined, "error"],
    ]);
  });
});
