import { describe, expect, test } from "bun:test";
import { BunTestReport } from "./BunTestReport";

describe("BunTestReport", () => {
  test("reads the final summary and attributes each failure to the file header above it", () => {
    const report = new BunTestReport(
      [
        "bun test v1.4.2 (744846f84)",
        "",
        "server\\artifact\\routeSeedIndex.test.ts:",
        "(pass) route seed index > keeps seeds [0.40ms]",
        "(fail) route seed index > restores relative seed paths [1.20ms]",
        "",
        "lib/linter.test.ts:",
        "\u001b[31m(fail) Linter > finds biome [3.00ms]\u001b[0m",
        "",
        "2 tests failed:",
        "(fail) route seed index > restores relative seed paths [1.20ms]",
        "(fail) Linter > finds biome [3.00ms]",
        "",
        " 1 pass",
        " 3 skip",
        " 2 fail",
        " 1 error",
        "Ran 6 tests across 2 files. [120.00ms]",
      ].join("\r\n"),
    );

    expect(report.hasSummary).toBe(true);
    expect([report.pass, report.fail, report.skip, report.errors, report.files]).toEqual([1, 2, 3, 1, 2]);
    expect(report.failures).toEqual([
      { file: "server/artifact/routeSeedIndex.test.ts", name: "route seed index > restores relative seed paths" },
      { file: "lib/linter.test.ts", name: "Linter > finds biome" },
    ]);
    expect(report.passed).toBe(false);
  });

  test("a run with no summary is not passed, and counts what it saw before it stopped", () => {
    const report = new BunTestReport(
      [
        "server/akanApp.test.ts:",
        "(pass) AkanApp > boots [1ms]",
        "(pass) AkanApp > relays [2ms]",
        "panic(main thread)",
      ].join("\n"),
    );

    expect(report.hasSummary).toBe(false);
    expect(report.passed).toBe(false);
    expect(report.pass).toBe(2);
    expect(report.lastFile).toBe("server/akanApp.test.ts");
  });

  test("a clean summary passes", () => {
    const report = new BunTestReport(" 4 pass\n 0 fail\nRan 4 tests across 1 file. [12.00ms]\n");

    expect(report.passed).toBe(true);
    expect(report.files).toBe(1);
  });
});
