import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BunTestReport } from "./BunTestReport";
import { PlatformTestRun } from "./PlatformTestRun";
import type { PackageTestResult, PlatformTestResult } from "./PlatformTestTarget";

const roots: string[] = [];
afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const pkg = (status: PackageTestResult["status"]): PackageTestResult => ({
  pkg: "akanjs",
  status,
  report: new BunTestReport(""),
  ms: 1,
  logPath: "x.log",
});
const result = (
  platform: PlatformTestResult["platform"],
  policy: PlatformTestResult["policy"],
  packages: PackageTestResult[],
  infraError: string | null = null,
): PlatformTestResult => ({ platform, policy, packages, envWarnings: [], infraError, ms: 1 });

describe("PlatformTestRun", () => {
  test("a failing gate blocks, a failing warn only warns, and a setup failure counts as a failure", () => {
    const verdict = PlatformTestRun.verdict([
      result("linux", "gate", [pkg("pass"), pkg("fail")]),
      result("windows", "warn", [pkg("pass")], "cannot reach user@host over ssh"),
    ]);

    expect(verdict.blocking.map((one) => one.platform)).toEqual(["linux"]);
    expect(verdict.warning.map((one) => one.platform)).toEqual(["windows"]);
  });

  test("a hung package fails its platform", () => {
    expect(PlatformTestRun.failed(result("windows", "gate", [pkg("pass"), pkg("hung")]))).toBe(true);
    expect(PlatformTestRun.failed(result("windows", "gate", [pkg("pass")]))).toBe(false);
  });

  test("hands a test host only the env keys the CLI needs, never the secrets beside them", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "akan-platform-env-"));
    roots.push(root);
    await writeFile(
      path.join(root, ".env"),
      ["USE_AKANJS_PKGS=true", "OPENAI_API_KEY=sk-secret", 'AKAN_PUBLIC_SERVE_DOMAIN="akanjs.com"', "JEV_KEY=x"].join(
        "\n",
      ),
    );

    expect(await PlatformTestRun.allowlistedEnv(root)).toBe(
      'USE_AKANJS_PKGS=true\nAKAN_PUBLIC_SERVE_DOMAIN="akanjs.com"\n',
    );
  });

  test("reads a comma-separated platform list, where none means no remote platform", () => {
    expect(PlatformTestRun.parsePlatforms("linux, Windows,linux")).toEqual(["linux", "windows"]);
    expect(PlatformTestRun.parsePlatforms("none")).toEqual([]);
    expect(() => PlatformTestRun.parsePlatforms("linux,mac")).toThrow("mac");
  });

  test("run ids sort by time", () => {
    expect(PlatformTestRun.newRunId(new Date(2026, 8, 26, 9, 5, 7))).toBe("20260926-090507");
  });
});
