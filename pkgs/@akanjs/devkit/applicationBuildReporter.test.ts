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

  test("names every variable a deployed build needs when the build is for local", () => {
    ApplicationBuildReporter.printSummary(resultFor("local"));

    const notice = rawLog.mock.calls.map(([line]) => line).at(-1);
    expect(notice).toBe(ApplicationBuildReporter.localBuildNotice);
    for (const key of ["AKAN_PUBLIC_ENV=main", "AKAN_PUBLIC_REPO_NAME", "AKAN_PUBLIC_SERVE_DOMAIN"])
      expect(notice).toContain(key);
  });

  test("adds nothing to a build for a deployed environment", () => {
    ApplicationBuildReporter.printSummary(resultFor("main"));

    expect(rawLog.mock.calls.map(([line]) => line)).not.toContain(ApplicationBuildReporter.localBuildNotice);
    expect(rawLog.mock.calls.at(-1)?.[0]).toBe("Done in 1.2s");
  });
});
