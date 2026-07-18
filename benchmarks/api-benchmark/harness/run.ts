import path from "node:path";
import { BENCH_ROOT, ensureDir, RESULTS_DIR, readJson, sleep, spawnServer, waitForHttp, which, writeJson } from "./lib";
import { ResourceSampler, type ResourceSummary } from "./resourceSampler";
import { loadTargets, type Target } from "./targets";

/**
 * Benchmark orchestrator.
 *
 * Usage:
 *   bun harness/run.ts --target raw-bun --suite rest
 *   bun harness/run.ts --target akan-single --suite rest,db,fullstack --vus 100 --duration 60s
 *   bun harness/run.ts --all --suite rest --rps 10000
 *
 * Produces results/<runId>/<target>__<scenario>.json combining k6 latency/throughput,
 * sampled resource usage, the trace snapshot (akanjs), and SLO pass/fail.
 */

interface ScenarioSpec {
  id: string;
  surface: "pure_http" | "signal" | "rest" | "db" | "websocket" | "fullstack" | "ssr";
  script: "rest.js" | "websocket.js" | "fullstack.js";
  k6Scenario?: "purePing" | "signalPing" | "ping" | "find" | "list" | "relation" | "create";
  axis: "minimal" | "realistic";
  auth: boolean;
  sloKey: string;
}

const SCENARIOS: Record<string, ScenarioSpec[]> = {
  pure_http: [
    {
      id: "pure_http_no_db",
      surface: "pure_http",
      script: "rest.js",
      k6Scenario: "purePing",
      axis: "minimal",
      auth: false,
      sloKey: "pure_http_no_db",
    },
  ],
  signal: [
    {
      id: "signal_no_db",
      surface: "signal",
      script: "rest.js",
      k6Scenario: "signalPing",
      axis: "minimal",
      auth: false,
      sloKey: "signal_no_db",
    },
  ],
  rest: [
    {
      id: "rest_minimal_ping",
      surface: "rest",
      script: "rest.js",
      k6Scenario: "ping",
      axis: "minimal",
      auth: false,
      sloKey: "rest_minimal",
    },
    {
      id: "rest_realistic_find",
      surface: "rest",
      script: "rest.js",
      k6Scenario: "find",
      axis: "realistic",
      auth: true,
      sloKey: "rest_realistic",
    },
    {
      id: "rest_realistic_create",
      surface: "rest",
      script: "rest.js",
      k6Scenario: "create",
      axis: "realistic",
      auth: true,
      sloKey: "rest_realistic",
    },
  ],
  db: [
    {
      id: "db_find_one",
      surface: "db",
      script: "rest.js",
      k6Scenario: "find",
      axis: "realistic",
      auth: true,
      sloKey: "db_find_one",
    },
    {
      id: "db_list",
      surface: "db",
      script: "rest.js",
      k6Scenario: "list",
      axis: "realistic",
      auth: true,
      sloKey: "db_list",
    },
    {
      id: "db_relation",
      surface: "db",
      script: "rest.js",
      k6Scenario: "relation",
      axis: "realistic",
      auth: true,
      sloKey: "db_relation",
    },
  ],
  fullstack: [
    {
      id: "fullstack_e2e",
      surface: "fullstack",
      script: "fullstack.js",
      axis: "realistic",
      auth: true,
      sloKey: "fullstack_e2e",
    },
  ],
  websocket: [
    {
      id: "websocket_fanout",
      surface: "websocket",
      script: "websocket.js",
      axis: "realistic",
      auth: false,
      sloKey: "websocket_fanout",
    },
  ],
};

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
    soak: args.includes("--soak"),
    suites: (get("--suite", args.includes("--soak") ? "signal,db" : "rest") as string).split(","),
    scenarios: (get("--scenario", "") as string).split(",").filter(Boolean),
    vus: Number(get("--vus", "50")),
    duration: get("--duration", "30s") as string,
    warmup: get("--warmup", "10s") as string,
    sampleIntervalMs: Number(get("--sample-interval", args.includes("--soak") ? "5000" : "1000")),
    soakWarmupWindowMs: parseDurationMs(get("--soak-warmup-window", "5m") as string),
    rps: Number(get("--rps", "0")),
    msgPerSec: Number(get("--msg-per-sec", "50")),
    roomId: get("--room-id", "bench-room") as string,
    idMax: Number(get("--id-max", "9999")),
    skipMissingK6: args.includes("--skip-missing-k6"),
  };
};

const parseDurationMs = (value: string): number => {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = match[2] ?? "ms";
  const multipliers: Record<string, number> = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 };
  return Math.round(amount * multipliers[unit]);
};

const runK6 = async (
  script: string,
  env: Record<string, string>,
  resultFile: string,
): Promise<Record<string, unknown> | null> => {
  await ensureDir(path.dirname(resultFile));
  const proc = spawnServer(["k6", "run", "--quiet", path.join(BENCH_ROOT, "k6", script)], {
    ...env,
    RESULT_FILE: resultFile,
  });
  await proc.proc.exited;
  return await readJson<Record<string, unknown>>(resultFile);
};

/**
 * Obtain an auth token, retrying through worker warmup. The gateway answers before its
 * federation worker is ready (returns 503 "No healthy federation child"), so we retry on
 * 5xx for up to `warmupMs` and only give up (or fail fast) on a 4xx credential rejection.
 */
const obtainToken = async (target: Target, warmupMs = 90_000): Promise<string> => {
  if (process.env.BENCH_TOKEN) return process.env.BENCH_TOKEN;
  const deadline = Date.now() + warmupMs;
  let lastStatus = 0;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${target.baseUrl}${target.paths.login}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target.loginCredentials ?? {}),
        signal: AbortSignal.timeout(5_000),
      });
      lastStatus = res.status;
      if (res.ok) {
        const data = (await res.json()) as { token?: string; accessToken?: string; jwt?: string };
        return data.token ?? data.accessToken ?? data.jwt ?? "";
      }
      if (res.status >= 400 && res.status < 500) {
        console.warn(`  login rejected (${res.status}) at ${target.paths.login}; check credentials`);
        return "";
      }
    } catch {
      // network/timeout during warmup; retry
    }
    await sleep(1_000);
  }
  console.warn(`  login did not succeed within ${warmupMs}ms (last status ${lastStatus}) at ${target.paths.login}`);
  return "";
};

/** Minimal akanjs `user` create payload (UserInput): nickname (<=12 chars) + image arrays. */
const akanUserPayload = (seq: number) => ({ nickname: `bu${seq}`.slice(0, 12), images: [], appliedImages: [] });

/**
 * Seed documents through `paths.create` and return the path to a JSON id pool file.
 * akanjs document ids are server-generated strings, so find/relation scenarios must
 * sample from real ids rather than synthesising them.
 */
const seedIdPool = async (target: Target, token: string, runDir: string): Promise<string | null> => {
  if (!target.seed) return null;
  const { count, bodyKey } = target.seed;
  const url = `${target.baseUrl}${target.paths.create}`;
  const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const ids: string[] = [];
  const concurrency = 64;
  const started = Date.now();
  for (let i = 0; i < count; i += concurrency) {
    const batch: Promise<string | null>[] = [];
    for (let j = i; j < Math.min(i + concurrency, count); j++) {
      const body = JSON.stringify({ [bodyKey]: akanUserPayload(j) });
      batch.push(
        fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(10_000) })
          .then((r) => (r.ok ? (r.json() as Promise<{ id?: string }>) : null))
          .then((d) => d?.id ?? null)
          .catch(() => null),
      );
    }
    for (const id of await Promise.all(batch)) if (id) ids.push(id);
  }
  if (ids.length === 0) {
    console.warn(
      `  seed produced 0 ids (create at ${target.paths.create} likely failed); find/relation will be empty.`,
    );
    return null;
  }
  const poolFile = path.join(runDir, `${target.name}.idpool.json`);
  await writeJson(poolFile, ids);
  console.info(`  seeded ${ids.length}/${count} docs in ${Math.round((Date.now() - started) / 1000)}s -> id pool`);
  return poolFile;
};

const waitForTargetReady = async (target: Target, timeoutMs = 60_000): Promise<number> => {
  if (!target.metricsUrl) return await waitForHttp(`${target.baseUrl}${target.paths.ping}`, timeoutMs);
  const healthUrl = target.metricsUrl.replace(/\/metrics$/, "/health");
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(1_000) });
      if (res.ok) {
        const data = (await res.json()) as {
          children?: Array<{ ready?: boolean; status?: string }>;
        };
        const hasReadyHttpChild = data.children?.some(
          (child) => child.ready && child.status !== "unhealthy" && child.status !== "exited",
        );
        if (hasReadyHttpChild) return performance.now() - start;
      }
    } catch {
      // not up yet
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${healthUrl}`);
};

const needsAuthOrSeed = (scenarios: ScenarioSpec[]) =>
  scenarios.some(
    (scenario) => scenario.auth || ["find", "list", "relation", "create"].includes(scenario.k6Scenario ?? ""),
  );

const evaluateSlo = (
  slo: Record<
    string,
    {
      maxP99Ms?: number;
      minRps?: number;
      maxErrorRate?: number;
      minMsgPerSec?: number;
      maxConnections?: number;
      maxDropRate?: number;
    }
  >,
  sloKey: string,
  summary: Record<string, unknown>,
) => {
  const target = slo[sloKey];
  if (!target) return { sloKey, checks: [], pass: true };
  const checks: Array<{ metric: string; value: number | null; bound: number; op: string; pass: boolean }> = [];
  const latency = (summary.latencyMs ?? summary.iterationMs) as { p99?: number } | undefined;
  const deliveryLatency = summary.deliveryLatencyMs as { p99?: number } | undefined;
  const rps = (summary.rps ?? summary.iterationsPerSec) as number | undefined;
  const messagesPerSec = summary.messagesPerSec as number | undefined;
  const connections = summary.connections as number | undefined;
  const errorRate = summary.errorRate as number | undefined;
  const dropRate = summary.dropRate as number | undefined;
  const p99Ms = latency?.p99 ?? deliveryLatency?.p99;
  if (target.maxP99Ms != null && p99Ms != null)
    checks.push({
      metric: "p99Ms",
      value: p99Ms,
      bound: target.maxP99Ms,
      op: "<=",
      pass: p99Ms <= target.maxP99Ms,
    });
  if (target.minRps != null && rps != null)
    checks.push({ metric: "rps", value: rps, bound: target.minRps, op: ">=", pass: rps >= target.minRps });
  if (target.minMsgPerSec != null && messagesPerSec != null)
    checks.push({
      metric: "msgPerSec",
      value: messagesPerSec,
      bound: target.minMsgPerSec,
      op: ">=",
      pass: messagesPerSec >= target.minMsgPerSec,
    });
  if (target.maxConnections != null && connections != null)
    checks.push({
      metric: "connections",
      value: connections,
      bound: target.maxConnections,
      op: ">=",
      pass: connections >= target.maxConnections,
    });
  if (target.maxErrorRate != null && errorRate != null)
    checks.push({
      metric: "errorRate",
      value: errorRate,
      bound: target.maxErrorRate,
      op: "<=",
      pass: errorRate <= target.maxErrorRate,
    });
  if (target.maxDropRate != null && dropRate != null)
    checks.push({
      metric: "dropRate",
      value: dropRate,
      bound: target.maxDropRate,
      op: "<=",
      pass: dropRate <= target.maxDropRate,
    });
  return { sloKey, checks, pass: checks.every((c) => c.pass) };
};

const evaluateProcessSlo = (
  processSlo: {
    eventLoopLagP99Ms?: number;
    soakRssGrowthMbPerHour?: number;
  },
  resource: ResourceSummary,
  summary: Record<string, unknown> | null,
  soak: boolean,
) => {
  const checks: Array<{ metric: string; value: number | null; bound: number; op: string; pass: boolean }> = [];
  if (processSlo.eventLoopLagP99Ms != null && resource.eventLoopLagP99Ms != null) {
    checks.push({
      metric: "eventLoopLagP99Ms",
      value: resource.eventLoopLagP99Ms,
      bound: processSlo.eventLoopLagP99Ms,
      op: "<=",
      pass: resource.eventLoopLagP99Ms <= processSlo.eventLoopLagP99Ms,
    });
  }
  if (soak && processSlo.soakRssGrowthMbPerHour != null && resource.rssGrowthMbPerHour != null) {
    checks.push({
      metric: "rssGrowthMbPerHour",
      value: resource.rssGrowthMbPerHour,
      bound: processSlo.soakRssGrowthMbPerHour,
      op: "<=",
      pass: resource.rssGrowthMbPerHour <= processSlo.soakRssGrowthMbPerHour,
    });
  }
  const errorRate = summary?.errorRate as number | undefined;
  if (soak && errorRate != null) {
    checks.push({
      metric: "soakErrorRate",
      value: errorRate,
      bound: 0.001,
      op: "<=",
      pass: errorRate <= 0.001,
    });
  }
  return { checks, pass: checks.every((check) => check.pass) };
};

const summarizeProcessStability = (
  opts: ReturnType<typeof parseArgs>,
  summary: Record<string, unknown> | null,
  resource: ResourceSummary,
) => ({
  soak: opts.soak,
  sampleIntervalMs: opts.sampleIntervalMs,
  soakWarmupWindowMs: opts.soakWarmupWindowMs,
  rssGrowthMbPerHour: resource.rssGrowthMbPerHour ?? null,
  eventLoopLagP99Ms: resource.eventLoopLagP99Ms ?? null,
  gcDurationP99Ms: resource.gcDurationP99Ms ?? null,
  workerRestartCount: resource.workerRestartCount ?? null,
  rscWorkerRestartCount: resource.rscWorkerRestartCount ?? null,
  rscWorkerRecycleCount: resource.rscWorkerRecycleCount ?? null,
  errorRate: (summary?.errorRate as number | undefined) ?? null,
  throughputDriftPct: null,
  p99LatencyDriftPct: null,
  driftNote: "k6 summary output is aggregate-only; interval drift is reserved for a future k6 time-series output.",
});

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
  const sloConfig = await readJson<{
    surfaces?: Record<string, never>;
    process?: { eventLoopLagP99Ms?: number; soakRssGrowthMbPerHour?: number };
  }>(path.join(BENCH_ROOT, "config", "slo.json"));
  const slo = sloConfig?.surfaces ?? {};
  const processSlo = sloConfig?.process ?? {};

  if (!(await which("k6")) && !opts.skipMissingK6) {
    console.error(
      "k6 is not installed. Install it (https://k6.io/docs/get-started/installation/) or pass --skip-missing-k6.",
    );
    process.exit(1);
  }

  const selectedTargets = opts.all ? Object.keys(targets) : opts.target ? [opts.target] : [];
  if (selectedTargets.length === 0) {
    console.error(`Specify --target <name> or --all. Available: ${Object.keys(targets).join(", ")}`);
    process.exit(1);
  }

  const runId = opts.runId ?? new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(RESULTS_DIR, runId);
  await ensureDir(runDir);
  console.info(`Run ${runId} -> ${runDir}`);

  for (const targetName of selectedTargets) {
    const target = targets[targetName];
    if (!target) {
      console.warn(`Unknown target ${targetName}, skipping.`);
      continue;
    }
    console.info(`\n=== Target: ${target.label} (${target.runtimeLabel}) ===`);
    // When tracing is on for an akanjs target, point the worker at a trace sink file. The
    // app-server bundle and the framework metrics collector run in isolated module realms,
    // so the in-realm aggregator can't be read via the metrics endpoint; the file bridges it.
    const traceFile =
      process.env.AKAN_TRACE === "1" && target.metricsUrl ? path.join(runDir, `${target.name}.trace.json`) : undefined;
    const serverEnv = traceFile ? { ...target.env, AKAN_TRACE_FILE: traceFile } : target.env;
    let server: ReturnType<typeof spawnServer> | undefined;
    try {
      await assertBuildArtifact(target);
      server = spawnServer(target.cmd, serverEnv, target.cwd ?? BENCH_ROOT);
      const readyMs = await waitForTargetReady(target, 60_000);
      console.info(`ready in ${Math.round(readyMs)}ms (pid ${server.pid})`);
      const selectedScenarios = opts.suites.flatMap((suite) =>
        (SCENARIOS[suite] ?? []).filter((scenario) => target.surfaces.includes(scenario.surface)),
      );
      const runnableScenarios = opts.scenarios.length
        ? selectedScenarios.filter((scenario) => opts.scenarios.includes(scenario.id))
        : selectedScenarios;
      const shouldSetupData = needsAuthOrSeed(runnableScenarios);
      const token = shouldSetupData ? await obtainToken(target) : "";
      const idPoolFile = shouldSetupData ? await seedIdPool(target, token, runDir) : null;

      for (const scenario of runnableScenarios) {
        if (scenario.auth && !token)
          console.warn(`  ${scenario.id}: no token (set BENCH_TOKEN for ${target.name}); running unauthenticated.`);
        const resultFile = path.join(runDir, `${target.name}__${scenario.id}.k6.json`);
        const sampler = new ResourceSampler({
          pid: server.pid,
          metricsUrl: target.metricsUrl,
          intervalMs: opts.sampleIntervalMs,
          slopeWarmupMs: opts.soak ? opts.soakWarmupWindowMs : 0,
        });
        sampler.start();

        const env: Record<string, string> = {
          BASE_URL: target.baseUrl,
          AXIS: scenario.axis,
          DURATION: opts.duration,
          WARMUP: opts.warmup,
          VUS: String(opts.vus),
          RPS: String(opts.rps),
          MSG_PER_SEC: String(opts.msgPerSec),
          ROOM_ID: opts.roomId,
          ID_MAX: String(opts.idMax),
          TOKEN: token,
          PATH_PING: target.paths.ping,
          PATH_PURE_HTTP: target.paths.pureHttp,
          PATH_SIGNAL_NO_DB: target.paths.signalNoDb,
          PATH_FIND: target.paths.find,
          PATH_LIST: target.paths.list,
          PATH_RELATION: target.paths.relation,
          PATH_CREATE: target.paths.create,
          PATH_LOGIN: target.paths.login,
        };
        if (idPoolFile) env.ID_POOL_FILE = idPoolFile;
        if (target.seed) env.CREATE_BODY = JSON.stringify({ [target.seed.bodyKey]: akanUserPayload(0) });
        if (scenario.k6Scenario) env.SCENARIO = scenario.k6Scenario;
        if (target.wsUrl) env.WS_URL = target.wsUrl;
        const sloTarget = (slo as Record<string, { maxP99Ms?: number }>)[scenario.sloKey];
        if (sloTarget?.maxP99Ms) env.MAX_P99_MS = String(sloTarget.maxP99Ms);

        console.info(`  -> ${scenario.id} (${scenario.axis})`);
        const summary =
          opts.skipMissingK6 && !(await which("k6")) ? null : await runK6(scenario.script, env, resultFile);
        const resource = await sampler.stop();
        // Prefer the file-sink trace (cumulative, realm-bridged) over the metrics-endpoint
        // trace, which is empty under the realm split described above.
        if (traceFile) {
          const fileTrace = await readJson<{ endpoints?: unknown[] }>(traceFile);
          if (fileTrace?.endpoints?.length) resource.trace = fileTrace;
        }

        const record = {
          runId,
          target: target.name,
          targetLabel: target.label,
          runtime: target.runtimeLabel,
          scenario: scenario.id,
          surface: scenario.surface,
          axis: scenario.axis,
          config: {
            vus: opts.vus,
            duration: opts.duration,
            rps: opts.rps,
            msgPerSec: opts.msgPerSec,
            soak: opts.soak,
            sampleIntervalMs: opts.sampleIntervalMs,
            soakWarmupWindowMs: opts.soakWarmupWindowMs,
          },
          readyMs: Math.round(readyMs),
          result: summary,
          resource,
          slo: summary ? evaluateSlo(slo as never, scenario.sloKey, summary) : null,
          processSlo: evaluateProcessSlo(processSlo, resource, summary, opts.soak),
          processStability: summarizeProcessStability(opts, summary, resource),
          note: target.notes,
        };
        await writeJson(path.join(runDir, `${target.name}__${scenario.id}.json`), record);
      }
    } catch (error) {
      console.error(`Target ${target.name} failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await server?.stop();
    }
  }

  console.info(`\nDone. Results in ${runDir}\nGenerate a report with: bun report/generate.ts ${runId}`);
};

void main();
