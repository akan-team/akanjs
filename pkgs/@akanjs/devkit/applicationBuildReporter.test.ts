import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Logger } from "akanjs/common";
import { ApplicationBuildReporter, type ApplicationBuildResult } from "./applicationBuildReporter";

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
});
