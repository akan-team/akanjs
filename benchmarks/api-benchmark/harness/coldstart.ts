import path from "node:path";
import { BENCH_ROOT, ensureDir, RESULTS_DIR, readJson, round, sleep, spawnServer, waitForHttp, writeJson } from "./lib";
import { ResourceSampler } from "./resourceSampler";
import { loadTargets, type Target } from "./targets";

/**
 * Cold start + idle footprint. Boots a target N times, timing process-start to first
 * healthy response, and samples idle RSS after a short settle.
 *
 * Usage: bun harness/coldstart.ts --target raw-bun --iterations 5
 */

const parseArgs = () => {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback?: string) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
  };
  return {
    all: args.includes("--all"),
    target: get("--target"),
    runId: get("--run-id"),
    iterations: Number(get("--iterations", "5")),
    settleMs: Number(get("--settle", "3000")),
  };
};

const percentile = (arr: number[], pct: number) => {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1);
  return sorted[idx];
};

const stats = (arr: number[]) => ({
  p50: round(percentile(arr, 50)),
  p95: round(percentile(arr, 95)),
  min: round(arr.length ? Math.min(...arr) : null),
  max: round(arr.length ? Math.max(...arr) : null),
});

const waitForTargetReady = async (target: Target, timeoutMs = 60_000): Promise<number> => {
  if (!target.metricsUrl) return await waitForHttp(`${target.baseUrl}${target.paths.ping}`, timeoutMs);
  const healthUrl = target.metricsUrl.replace(/\/metrics$/, "/health");
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(1_000) });
      if (res.ok) {
        const data = (await res.json()) as { children?: Array<{ ready?: boolean; status?: string }> };
        const hasReadyHttpChild = data.children?.some(
          (child) => child.ready && child.status !== "unhealthy" && child.status !== "exited",
        );
        if (hasReadyHttpChild) return performance.now() - start;
      }
    } catch {
      // not ready yet
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${healthUrl}`);
};

const evaluateProcessSlo = (
  processSlo: { coldStartMs?: number; idleRssMb?: number },
  coldStartP95: number | null,
  idleRssP50: number | null,
) => {
  const checks: Array<{ metric: string; value: number | null; bound: number; op: string; pass: boolean }> = [];
  if (processSlo.coldStartMs != null && coldStartP95 != null) {
    checks.push({
      metric: "coldStartP95Ms",
      value: coldStartP95,
      bound: processSlo.coldStartMs,
      op: "<=",
      pass: coldStartP95 <= processSlo.coldStartMs,
    });
  }
  if (processSlo.idleRssMb != null && idleRssP50 != null) {
    checks.push({
      metric: "idleRssP50Mb",
      value: idleRssP50,
      bound: processSlo.idleRssMb,
      op: "<=",
      pass: idleRssP50 <= processSlo.idleRssMb,
    });
  }
  return { checks, pass: checks.every((check) => check.pass) };
};

const assertBuildArtifact = async (target: Target): Promise<void> => {
  if (!target.requiresBuildArtifact) return;
  if (await Bun.file(target.requiresBuildArtifact).exists()) return;
  throw new Error(
    `${target.name} requires a production artifact at ${target.requiresBuildArtifact}. Run \`${target.buildCommandHint ?? "bun run akan build <app>"}\` first.`,
  );
};

const main = async () => {
  const opts = parseArgs();
  const targets = await loadTargets();
  const processSlo =
    (
      await readJson<{ process?: { coldStartMs?: number; idleRssMb?: number } }>(
        path.join(BENCH_ROOT, "config", "slo.json"),
      )
    )?.process ?? {};
  const names = opts.all ? Object.keys(targets) : opts.target ? [opts.target] : [];
  if (!names.length) {
    console.error("Specify --target <name> or --all.");
    process.exit(1);
  }

  const runId = opts.runId ?? new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(RESULTS_DIR, runId, "coldstart.json");
  const existing = await readJson<{ records?: Array<{ target?: string }> }>(outFile);
  const records: Array<{ target?: string } & Record<string, unknown>> = [...(existing?.records ?? [])];

  for (const name of names) {
    const target = targets[name];
    if (!target) continue;
    const bootMs: number[] = [];
    const idleRssMb: number[] = [];
    let failures = 0;
    console.info(`\n=== ${target.label}: ${opts.iterations} cold starts ===`);
    try {
      await assertBuildArtifact(target);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      const record = {
        target: target.name,
        targetLabel: target.label,
        runtime: target.runtimeLabel,
        iterations: opts.iterations,
        successes: 0,
        failures: opts.iterations,
        settleMs: opts.settleMs,
        coldStartMs: stats([]),
        idleRssMb: stats([]),
        coldStartMsMedian: null,
        idleRssMbMedian: null,
        processSlo: evaluateProcessSlo(processSlo, null, null),
        note: target.notes,
        raw: { bootMs: [], idleRssMb: [] },
      };
      const existingIdx = records.findIndex((item) => item.target === target.name);
      if (existingIdx >= 0) records[existingIdx] = record;
      else records.push(record);
      continue;
    }
    for (let i = 0; i < opts.iterations; i++) {
      const server = spawnServer(target.cmd, target.env, target.cwd);
      try {
        const ready = await waitForTargetReady(target, 60_000);
        bootMs.push(ready);
        await sleep(opts.settleMs);
        const sampler = new ResourceSampler({ pid: server.pid, metricsUrl: target.metricsUrl, intervalMs: 300 });
        sampler.start();
        await sleep(1_000);
        const resource = await sampler.stop();
        if (resource.avgRssMb != null) idleRssMb.push(resource.avgRssMb);
        console.info(`  iter ${i + 1}: boot=${Math.round(ready)}ms idleRss=${resource.avgRssMb}MB`);
      } catch (error) {
        failures += 1;
        console.error(`  iter ${i + 1} failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        await server.stop();
        await sleep(500);
      }
    }
    const coldStart = stats(bootMs);
    const idleRss = stats(idleRssMb);
    const record = {
      target: target.name,
      targetLabel: target.label,
      runtime: target.runtimeLabel,
      iterations: opts.iterations,
      successes: bootMs.length,
      failures,
      settleMs: opts.settleMs,
      coldStartMs: coldStart,
      idleRssMb: idleRss,
      coldStartMsMedian: coldStart.p50,
      idleRssMbMedian: idleRss.p50,
      processSlo: evaluateProcessSlo(processSlo, coldStart.p95, idleRss.p50),
      note: target.notes,
      raw: { bootMs: bootMs.map((v) => round(v)), idleRssMb },
    };
    const existingIdx = records.findIndex((item) => item.target === target.name);
    if (existingIdx >= 0) records[existingIdx] = record;
    else records.push(record);
  }

  await ensureDir(path.dirname(outFile));
  await writeJson(outFile, { runId, surface: "coldstart", records });
  console.info(`\nDone. -> ${outFile}`);
};

void main();
