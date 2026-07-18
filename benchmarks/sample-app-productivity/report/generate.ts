#!/usr/bin/env bun
import path from "node:path";
import { ensureDir, median, RESULTS_DIR, type RunRecord, readJson, relativeToBench, writeJson } from "../harness/lib";

interface StackSummary {
  stack: string;
  label: string;
  runs: number;
  passedRuns: number;
  lintPassedRuns: number;
  conventionPassedRuns: number;
  failRate: number;
  tokenCoverage: number;
  medianTokens: number | null;
  medianWallClockMs: number | null;
  medianLoc: number | null;
  medianGlueLoc: number | null;
  medianAppSourceLoc: number | null;
  medianTestLoc: number | null;
  medianGeneratedOrLockLoc: number | null;
  medianConventionViolations: number | null;
}

const fmt = (value: number | null | undefined, suffix = "") =>
  typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}${suffix}` : "n/a";

const pct = (value: number) => `${Math.round(value * 100)}%`;

const lintPassed = (record: RunRecord) => record.lint?.success ?? true;
const conventionPassed = (record: RunRecord) => record.convention?.success ?? true;
const passed = (record: RunRecord) =>
  record.build.success && record.tests.success && lintPassed(record) && conventionPassed(record);

const stackSummary = (records: RunRecord[]): StackSummary[] => {
  const groups = new Map<string, RunRecord[]>();
  for (const record of records) {
    groups.set(record.stack, [...(groups.get(record.stack) ?? []), record]);
  }
  return [...groups.entries()]
    .map(([stack, stackRecords]) => {
      const passedRuns = stackRecords.filter(passed).length;
      const lintPassedRuns = stackRecords.filter(lintPassed).length;
      const conventionPassedRuns = stackRecords.filter(conventionPassed).length;
      const tokenRecords = stackRecords.filter((record) => record.tokens.total != null).length;
      return {
        stack,
        label: stackRecords[0]?.stackLabel ?? stack,
        runs: stackRecords.length,
        passedRuns,
        lintPassedRuns,
        conventionPassedRuns,
        failRate: stackRecords.length ? 1 - passedRuns / stackRecords.length : 0,
        tokenCoverage: stackRecords.length ? tokenRecords / stackRecords.length : 0,
        medianTokens: median(
          stackRecords.map((record) => record.tokens.total).filter((value): value is number => value != null),
        ),
        medianWallClockMs: median(
          stackRecords.map((record) => record.wallClockMs).filter((value): value is number => value != null),
        ),
        medianLoc: median(stackRecords.map((record) => record.code.loc)),
        medianGlueLoc: median(stackRecords.map((record) => record.code.glueLoc)),
        medianAppSourceLoc: median(stackRecords.map((record) => record.code.appSourceLoc)),
        medianTestLoc: median(stackRecords.map((record) => record.code.testLoc)),
        medianGeneratedOrLockLoc: median(stackRecords.map((record) => record.code.generatedOrLockLoc)),
        medianConventionViolations: median(
          stackRecords
            .map((record) => record.quality?.conventionViolationCount)
            .filter((value): value is number => value != null),
        ),
      };
    })
    .sort((a, b) => a.stack.localeCompare(b.stack));
};

const main = async () => {
  const runId = process.argv[2];
  if (!runId) {
    console.error("Usage: bun report/generate.ts <runId>");
    process.exit(1);
  }
  const runDir = path.join(RESULTS_DIR, runId);
  const glob = new Bun.Glob("*.json");
  const records: RunRecord[] = [];
  for await (const file of glob.scan({ cwd: runDir })) {
    if (
      file.endsWith(".verification.json") ||
      file.endsWith(".setup.json") ||
      file === "setup.summary.json" ||
      file === "report.chartdata.json"
    ) {
      continue;
    }
    const record = await readJson<RunRecord>(path.join(runDir, file));
    if (record?.stack && record?.code) records.push(record);
  }
  if (!records.length) {
    console.error(`No run records in ${relativeToBench(runDir)}.`);
    process.exit(1);
  }

  const summaries = stackSummary(records);
  const akan = summaries.find((summary) => summary.stack === "akanjs");
  const competitors = summaries.filter((summary) => summary.stack !== "akanjs");
  const competitorMedianTokens = median(
    competitors.map((summary) => summary.medianTokens).filter((value): value is number => value != null),
  );
  const competitorMedianWallClockMs = median(
    competitors.map((summary) => summary.medianWallClockMs).filter((value): value is number => value != null),
  );

  const lines: string[] = [];
  lines.push(`# Sample App Productivity Report — ${runId}`);
  lines.push("");
  lines.push(
    "> Measures Cursor token usage, wall-clock time, repair-loop completion, and generated LOC for the same Team Task Board app.",
  );
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(
    "| Stack | Runs | Pass | Lint pass | Convention pass | Fail rate | Token coverage | Median tokens | Median wall-clock | LOC | Glue LOC | App LOC | Test LOC | Generated/lock LOC | Convention violations |",
  );
  lines.push(
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const summary of summaries) {
    lines.push(
      `| ${summary.label} | ${summary.runs} | ${summary.passedRuns} | ${summary.lintPassedRuns} | ${summary.conventionPassedRuns} | ${pct(summary.failRate)} | ${pct(summary.tokenCoverage)} | ${fmt(summary.medianTokens)} | ${fmt(summary.medianWallClockMs, "ms")} | ${fmt(summary.medianLoc)} | ${fmt(summary.medianGlueLoc)} | ${fmt(summary.medianAppSourceLoc)} | ${fmt(summary.medianTestLoc)} | ${fmt(summary.medianGeneratedOrLockLoc)} | ${fmt(summary.medianConventionViolations)} |`,
    );
  }

  lines.push("");
  lines.push("## Homepage Metrics");
  lines.push("");
  lines.push(`- Akan total tokens: ${fmt(akan?.medianTokens)}`);
  lines.push(`- Competitor median total tokens: ${fmt(competitorMedianTokens)}`);
  lines.push(`- Akan wall-clock time: ${fmt(akan?.medianWallClockMs, "ms")}`);
  lines.push(`- Competitor median wall-clock time: ${fmt(competitorMedianWallClockMs, "ms")}`);
  lines.push(`- Akan final acceptance pass: ${akan ? `${akan.passedRuns}/${akan.runs}` : "n/a"}`);
  lines.push(`- Akan lint pass: ${akan ? `${akan.lintPassedRuns}/${akan.runs}` : "n/a"}`);
  lines.push(`- Akan convention pass: ${akan ? `${akan.conventionPassedRuns}/${akan.runs}` : "n/a"}`);
  lines.push(`- Akan generated LOC: ${fmt(akan?.medianLoc)}`);
  lines.push(`- Akan glue LOC: ${fmt(akan?.medianGlueLoc)}`);
  lines.push(`- Akan convention violations: ${fmt(akan?.medianConventionViolations)}`);

  const failed = records.filter((record) => !passed(record));
  lines.push("");
  lines.push("## Failed Runs");
  if (!failed.length) {
    lines.push("");
    lines.push("_No failed runs recorded._");
  } else {
    lines.push("");
    for (const record of failed) {
      const failedAcceptance = record.acceptance.filter((item) => !item.pass).map((item) => item.id);
      const conventionFailures = record.convention?.violations.map((item) => item.id) ?? [];
      const suffix = conventionFailures.length ? `; convention ${conventionFailures.join(", ")}` : "";
      lines.push(
        `- ${record.stack} iteration ${record.iteration}: failed ${failedAcceptance.join(", ") || "unknown"}${suffix}`,
      );
    }
  }

  lines.push("");
  lines.push("## Caveats");
  lines.push("");
  lines.push("- Cursor report fields that were unavailable are left as `null` and excluded from medians.");
  lines.push("- Runs are only comparable within the same dependency lockfile batch and agent model.");
  lines.push("- Agent execution is manual; the harness standardizes setup, verification, collection, and reporting.");

  const chartData = {
    runId,
    scenario: records[0]?.scenario ?? "team-task-board",
    generatedAt: new Date().toISOString(),
    summaries,
    homepage: {
      akanTotalTokens: akan?.medianTokens ?? null,
      competitorMedianTotalTokens: competitorMedianTokens,
      akanWallClockMs: akan?.medianWallClockMs ?? null,
      competitorMedianWallClockMs,
      akanFinalAcceptancePass: akan ? akan.passedRuns === akan.runs : null,
      akanLintPass: akan ? akan.lintPassedRuns === akan.runs : null,
      akanConventionPass: akan ? akan.conventionPassedRuns === akan.runs : null,
      akanGeneratedLoc: akan?.medianLoc ?? null,
      akanGlueLoc: akan?.medianGlueLoc ?? null,
      akanConventionViolations: akan?.medianConventionViolations ?? null,
    },
  };

  await ensureDir(runDir);
  await Bun.write(path.join(runDir, "report.md"), `${lines.join("\n")}\n`);
  await writeJson(path.join(runDir, "report.chartdata.json"), chartData);
  console.info(`Report written: ${relativeToBench(path.join(runDir, "report.md"))}`);
};

await main();
