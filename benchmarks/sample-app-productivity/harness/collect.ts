#!/usr/bin/env bun
import path from "node:path";
import {
  BENCH_ROOT,
  type CursorReport,
  countFileLines,
  findFirstExisting,
  hashFile,
  loadStackConfig,
  matchesAnyGlob,
  parseArgs,
  pathExists,
  type RunMode,
  type RunRecord,
  readJson,
  readPackageVersions,
  relativeToBench,
  resultPath,
  runCommand,
  setupPath,
  type VerificationSummary,
  verificationPath,
  workspacePath,
  writeJson,
} from "./lib";

interface LocClassification {
  exclude: string[];
  generatedOrLock: string[];
  test: string[];
  glue: string[];
  appSource: string[];
}

interface SetupRecord {
  installMs?: number | null;
  packagePolicy: RunRecord["dependencies"]["packagePolicy"];
  lockfile: string | null;
  lockfileHash: string | null;
  packages: Record<string, string>;
}

const LOCKFILES = ["bun.lock", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"];

const emptyCursorReport = (note: string): CursorReport => ({
  model: null,
  startedAt: null,
  finishedAt: null,
  wallClockMs: null,
  agentRuns: null,
  toolCalls: null,
  tokens: { input: null, output: null, cacheRead: null, cacheWrite: null, total: null },
  notes: [note],
});

const normalizeCursorReport = (report: Partial<CursorReport> | null): CursorReport => {
  if (!report) return emptyCursorReport("Cursor report was not provided.");
  return {
    model: report.model ?? null,
    startedAt: report.startedAt ?? null,
    finishedAt: report.finishedAt ?? null,
    wallClockMs: report.wallClockMs ?? null,
    agentRuns: report.agentRuns ?? null,
    toolCalls: report.toolCalls ?? null,
    tokens: {
      input: report.tokens?.input ?? null,
      output: report.tokens?.output ?? null,
      cacheRead: report.tokens?.cacheRead ?? null,
      cacheWrite: report.tokens?.cacheWrite ?? null,
      total: report.tokens?.total ?? null,
    },
    notes: report.notes ?? [],
  };
};

const changedFiles = async (workspace: string): Promise<string[]> => {
  const diff = await runCommand(["git", "diff", "--name-only", "HEAD"], { cwd: workspace });
  const untracked = await runCommand(["git", "ls-files", "--others", "--exclude-standard"], { cwd: workspace });
  const files = new Set<string>();
  for (const output of [diff.output, untracked.output]) {
    for (const line of output.split("\n")) {
      const file = line.trim();
      if (file) files.add(file);
    }
  }
  return [...files].sort();
};

const classifyLoc = async (workspace: string, classification: LocClassification) => {
  const files = await changedFiles(workspace);
  const result = {
    files: 0,
    loc: 0,
    appSourceLoc: 0,
    glueLoc: 0,
    testLoc: 0,
    generatedOrLockLoc: 0,
  };

  for (const file of files) {
    if (matchesAnyGlob(file, classification.exclude)) continue;
    const fullPath = path.join(workspace, file);
    if (!(await pathExists(fullPath))) continue;
    const loc = await countFileLines(fullPath);
    if (matchesAnyGlob(file, classification.generatedOrLock)) {
      result.generatedOrLockLoc += loc;
      continue;
    }
    result.files++;
    result.loc += loc;
    if (matchesAnyGlob(file, classification.test)) result.testLoc += loc;
    else if (matchesAnyGlob(file, classification.glue)) result.glueLoc += loc;
    else if (matchesAnyGlob(file, classification.appSource)) result.appSourceLoc += loc;
    else result.appSourceLoc += loc;
  }
  return result;
};

const qualityCounters = async (workspace: string, classification: LocClassification) => {
  const files = await changedFiles(workspace);
  const active = files.filter(
    (file) => !matchesAnyGlob(file, classification.exclude) && !matchesAnyGlob(file, classification.generatedOrLock),
  );
  return {
    duplicateLogicCount: null,
    explicitApiClientBoilerplateCount: active.filter((file) => /(^|\/)(client|fetch|apiClient)\.[tj]sx?$/.test(file))
      .length,
    schemaDuplicationCount: active.filter((file) => /(schema|prisma|drizzle)/i.test(file)).length,
    frameworkConfigCount: active.filter((file) => /(config|middleware)\.[tj]s$/.test(file)).length,
  };
};

const resolveBenchPath = (value: string): string => (path.isAbsolute(value) ? value : path.join(BENCH_ROOT, value));

const emptyLint = (): VerificationSummary["lint"] => ({
  success: true,
  durationMs: null,
  command: null,
  logFile: null,
  skipped: true,
  note: "Lint result was not present in the verification record.",
});

const emptyConvention = (): VerificationSummary["convention"] => ({
  success: true,
  checker: null,
  durationMs: null,
  logFile: null,
  skipped: true,
  violations: [],
  metrics: {},
  note: "Convention result was not present in the verification record.",
});

const metricNumber = (metrics: Record<string, number | boolean | string | null>, key: string): number | null => {
  const value = metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const main = async () => {
  const args = parseArgs({ run: "smoke", mode: "repair-loop", iteration: "1" });
  const runId = String(args["run-id"] ?? args.run);
  const stackId = String(args.stack ?? "");
  const mode = String(args.mode) as RunMode;
  const iteration = Number(args.iteration ?? 1);
  if (!stackId) throw new Error("Missing --stack <stackId>");

  const config = await loadStackConfig();
  const stack = config.stacks.find((candidate) => candidate.id === stackId);
  if (!stack) throw new Error(`Unknown stack: ${stackId}`);

  const workspace = workspacePath(runId, stack.id);
  if (!(await pathExists(workspace))) {
    throw new Error(`Missing workspace for ${stack.id}: ${relativeToBench(workspace)}. Run harness/setup.ts first.`);
  }
  const setup = await readJson<SetupRecord>(setupPath(runId, stack.id));
  const verification = await readJson<VerificationSummary>(verificationPath(runId, stack.id));
  if (!verification) {
    throw new Error(
      `Missing verification record for ${stack.id}: ${relativeToBench(
        verificationPath(runId, stack.id),
      )}. Run harness/verify.ts first.`,
    );
  }

  const cursorReportPath = args["cursor-report"]
    ? resolveBenchPath(String(args["cursor-report"]))
    : path.join(workspace, "cursor-report.json");
  const cursorReport = normalizeCursorReport(await readJson<Partial<CursorReport>>(cursorReportPath));
  const classification = await readJson<LocClassification>(path.join(BENCH_ROOT, "config", "loc-classification.json"));
  if (!classification) throw new Error("Missing config/loc-classification.json");

  const code = await classifyLoc(workspace, classification);
  const lint = verification.lint ?? emptyLint();
  const convention = verification.convention ?? emptyConvention();
  const baseQuality = await qualityCounters(workspace, classification);
  const quality = {
    ...baseQuality,
    conventionViolationCount: convention.violations.length,
    forbiddenDependencyCount: metricNumber(convention.metrics, "forbiddenDependencyCount"),
  };
  const lockfile = await findFirstExisting(workspace, LOCKFILES);
  const lockfileHash = lockfile ? await hashFile(lockfile) : null;
  const packages = await readPackageVersions(workspace);
  const notes = [...(cursorReport.notes ?? [])];
  if (!setup) notes.push(`Setup record not found at ${relativeToBench(setupPath(runId, stack.id))}.`);
  if (!(await pathExists(cursorReportPath)))
    notes.push(`Cursor report not found at ${relativeToBench(cursorReportPath)}; token fields are null.`);

  const record: RunRecord = {
    runId,
    scenario: config.scenario,
    stack: stack.id,
    stackLabel: stack.label,
    stackVersion: stack.id === "akanjs" ? (packages.akanjs ?? null) : null,
    mode,
    iteration,
    model: cursorReport.model,
    startedAt: cursorReport.startedAt,
    finishedAt: cursorReport.finishedAt,
    wallClockMs: cursorReport.wallClockMs,
    installMs: setup?.installMs ?? null,
    firstImplementationMs: null,
    repairMs: null,
    tokens: cursorReport.tokens,
    toolCalls: cursorReport.toolCalls,
    agentRuns: cursorReport.agentRuns,
    build: verification.build,
    tests: verification.tests,
    lint,
    convention,
    code,
    quality,
    acceptance: verification.acceptance,
    dependencies: {
      packagePolicy: setup?.packagePolicy ?? stack.packagePolicy,
      lockfile: lockfile ? path.relative(workspace, lockfile) : null,
      lockfileHash,
      packages,
      reusedLockfile: setup?.lockfileHash && lockfileHash ? setup.lockfileHash === lockfileHash : null,
    },
    repairLoop: {
      attempts: cursorReport.agentRuns,
      maxAttempts: 4,
      failureInputs: [],
    },
    cursorWorkspace: {
      path: relativeToBench(workspace),
      mode,
    },
    notes,
  };

  const out = resultPath(runId, stack.id, mode, iteration);
  await writeJson(out, record);
  console.info(`Run record written: ${relativeToBench(out)}`);
};

await main();
