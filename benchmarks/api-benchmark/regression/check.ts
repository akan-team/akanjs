import path from "node:path";
import { BENCH_ROOT, RESULTS_DIR, readJson } from "../harness/lib";

/**
 * Regression gate for CI. Compares a run's per-scenario results against stored baselines
 * and fails (exit 1) if latency rises or throughput falls beyond the SLO regression
 * ratios. This is the "internal improvement" half of the plan: catch perf regressions
 * per PR rather than producing a one-off report.
 *
 * Usage:
 *   bun regression/check.ts --run <runId>                 # check run vs baselines
 *   bun regression/check.ts --run <runId> --update        # write/refresh baselines
 *
 * Baselines live in benchmarks/regression/baselines/<target>__<scenario>.json
 */

interface RunRecord {
  target: string;
  scenario: string;
  result?: {
    rps?: number;
    iterationsPerSec?: number;
    messagesPerSec?: number;
    latencyMs?: { p99?: number };
    iterationMs?: { p99?: number };
    deliveryLatencyMs?: { p99?: number };
  } | null;
  resource?: { maxRssMb?: number | null };
}

interface Baseline {
  target: string;
  scenario: string;
  p99Ms: number | null;
  rps: number | null;
  maxRssMb: number | null;
  recordedAt: string;
}

const BASELINE_DIR = path.join(BENCH_ROOT, "regression", "baselines");

const extract = (record: RunRecord) => {
  const p99Ms =
    record.result?.latencyMs?.p99 ?? record.result?.iterationMs?.p99 ?? record.result?.deliveryLatencyMs?.p99 ?? null;
  const rps = record.result?.rps ?? record.result?.iterationsPerSec ?? record.result?.messagesPerSec ?? null;
  const maxRssMb = record.resource?.maxRssMb ?? null;
  return { p99Ms, rps, maxRssMb };
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };
  return { runId: get("--run"), update: args.includes("--update") };
};

const main = async () => {
  const { runId, update } = parseArgs();
  if (!runId) {
    console.error("Provide --run <runId>.");
    process.exit(1);
  }
  const runDir = path.join(RESULTS_DIR, runId);
  const slo = await readJson<{
    regression: { maxP99RegressionRatio: number; maxRpsRegressionRatio: number; maxRssRegressionRatio: number };
  }>(path.join(BENCH_ROOT, "config", "slo.json"));
  const reg = slo?.regression ?? {
    maxP99RegressionRatio: 0.15,
    maxRpsRegressionRatio: 0.1,
    maxRssRegressionRatio: 0.15,
  };

  const glob = new Bun.Glob("*.json");
  const failures: string[] = [];
  let checked = 0;

  for await (const file of glob.scan({ cwd: runDir })) {
    if (file.endsWith(".k6.json") || file === "coldstart.json") continue;
    const record = await readJson<RunRecord>(path.join(runDir, file));
    if (!record?.scenario) continue;
    const current = extract(record);
    const baselineFile = path.join(BASELINE_DIR, `${record.target}__${record.scenario}.json`);

    if (update) {
      const baseline: Baseline = {
        target: record.target,
        scenario: record.scenario,
        ...current,
        recordedAt: new Date().toISOString(),
      };
      await Bun.write(baselineFile, `${JSON.stringify(baseline, null, 2)}\n`);
      console.info(`updated baseline ${record.target}__${record.scenario}`);
      continue;
    }

    const baseline = await readJson<Baseline>(baselineFile);
    if (!baseline) {
      console.warn(`no baseline for ${record.target}__${record.scenario} (run with --update to create)`);
      continue;
    }
    checked++;

    if (baseline.p99Ms != null && current.p99Ms != null) {
      const ratio = (current.p99Ms - baseline.p99Ms) / baseline.p99Ms;
      if (ratio > reg.maxP99RegressionRatio)
        failures.push(
          `${record.target}__${record.scenario}: p99 ${current.p99Ms}ms vs ${baseline.p99Ms}ms (+${(ratio * 100).toFixed(1)}%)`,
        );
    }
    if (baseline.rps != null && current.rps != null) {
      const ratio = (baseline.rps - current.rps) / baseline.rps;
      if (ratio > reg.maxRpsRegressionRatio)
        failures.push(
          `${record.target}__${record.scenario}: rps ${current.rps} vs ${baseline.rps} (-${(ratio * 100).toFixed(1)}%)`,
        );
    }
    if (baseline.maxRssMb != null && current.maxRssMb != null) {
      const ratio = (current.maxRssMb - baseline.maxRssMb) / baseline.maxRssMb;
      if (ratio > reg.maxRssRegressionRatio)
        failures.push(
          `${record.target}__${record.scenario}: RSS ${current.maxRssMb}MB vs ${baseline.maxRssMb}MB (+${(ratio * 100).toFixed(1)}%)`,
        );
    }
  }

  if (update) {
    console.info("Baselines updated.");
    return;
  }
  console.info(`Checked ${checked} scenario(s) against baselines.`);
  if (failures.length) {
    console.error(`\nPERFORMANCE REGRESSION DETECTED (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.info("No regressions beyond thresholds.");
};

void main();
