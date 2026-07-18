#!/usr/bin/env bun
import path from "node:path";
import { runConventionCheck } from "./conventionCheck";
import {
  ensureDir,
  loadStackConfig,
  parseArgs,
  RESULTS_DIR,
  relativeToBench,
  runCommand,
  spawnLongRunning,
  type VerificationSummary,
  verificationPath,
  waitForHttp,
  workspacePath,
  writeJson,
} from "./lib";

const ACCEPTANCE = [
  { id: "list-visible", label: "`/` or `/tasks` shows the task list" },
  { id: "create-task", label: "A task can be created" },
  { id: "change-status", label: "A task status can be changed" },
  { id: "assign-task", label: "An assignee can be selected or changed" },
  { id: "status-filter", label: "The status filter changes the visible task list" },
  { id: "task-detail", label: "Task detail is visible in a detail page or panel" },
  { id: "reload-persistence", label: "Refreshing the page keeps created or updated data" },
  { id: "build-success", label: "The build command succeeds" },
  { id: "lint-success", label: "The configured lint command succeeds" },
  { id: "convention-success", label: "The configured convention check succeeds" },
  { id: "smoke-success", label: "The smoke test command succeeds" },
];

const SMOKE_COMMAND = ["bun", "x", "playwright", "test", "smoke/team-task-board.spec.ts", "--reporter=line"];

const main = async () => {
  const args = parseArgs({ run: "smoke" });
  const runId = String(args["run-id"] ?? args.run);
  const stackId = String(args.stack ?? "");
  if (!stackId) throw new Error("Missing --stack <stackId>");

  const config = await loadStackConfig();
  const stack = config.stacks.find((candidate) => candidate.id === stackId);
  if (!stack) throw new Error(`Unknown stack: ${stackId}`);

  const workspace = workspacePath(runId, stack.id);
  const logDir = path.join(RESULTS_DIR, runId, "logs");
  await ensureDir(logDir);

  const buildLog = path.join(logDir, `${stack.id}.build.log`);
  const lintLog = path.join(logDir, `${stack.id}.lint.log`);
  const conventionLog = path.join(logDir, `${stack.id}.convention.log`);
  const smokeLog = path.join(logDir, `${stack.id}.smoke.log`);
  const startLog = path.join(logDir, `${stack.id}.start.log`);

  console.info(`Building ${stack.id}`);
  const build = await runCommand(stack.buildCommand, { cwd: workspace, logFile: buildLog });
  const lint = stack.lintCommand ? await runCommand(stack.lintCommand, { cwd: workspace, logFile: lintLog }) : null;
  const lintSummary = lint
    ? {
        success: lint.success,
        durationMs: lint.durationMs,
        command: stack.lintCommand ?? null,
        logFile: relativeToBench(lintLog),
        skipped: false,
        note: lint.success
          ? `Lint command passed; inspect ${relativeToBench(lintLog)} if needed.`
          : `Lint command failed; inspect ${relativeToBench(lintLog)}.`,
      }
    : {
        success: true,
        durationMs: null,
        command: null,
        logFile: null,
        skipped: true,
        note: "Lint command is not configured for this stack.",
      };

  const convention = await runConventionCheck(stack.conventionCheck, workspace, conventionLog);

  let smokeSuccess = false;
  let smokeDurationMs: number | null = null;
  let smokePassed: number | null = null;
  let smokeFailed: number | null = null;
  let smokeNote = "Smoke test did not run.";

  if (!build.success) {
    smokeNote = `Build failed; inspect ${relativeToBench(buildLog)}.`;
  } else if (!lintSummary.success) {
    smokeNote = `Lint failed; inspect ${relativeToBench(lintLog)}.`;
  } else if (!convention.success) {
    smokeNote = `Convention check failed; inspect ${relativeToBench(conventionLog)}.`;
  } else if (args["skip-smoke"]) {
    smokeNote = "Smoke test was skipped by --skip-smoke.";
  } else {
    console.info(`Starting ${stack.id} at ${stack.baseUrl}`);
    const started = performance.now();
    let server: Awaited<ReturnType<typeof spawnLongRunning>> | null = null;
    try {
      server = await spawnLongRunning(stack.startCommand, { cwd: workspace, logFile: startLog });
      const readyMs = await waitForHttp(stack.baseUrl, Number(args["startup-timeout-ms"] ?? 90_000));
      console.info(`${stack.id} responded after ${readyMs}ms`);
      const started = performance.now();
      const smoke = await runCommand(
        ["bun", "x", "playwright", "test", path.join("smoke", "team-task-board.spec.ts"), "--reporter=line"],
        {
          cwd: path.resolve(import.meta.dir, ".."),
          env: {
            BASE_URL: stack.baseUrl,
          },
          logFile: smokeLog,
        },
      );
      smokeDurationMs = Math.round(performance.now() - started);
      smokeSuccess = smoke.success;
      smokePassed = smoke.success ? 1 : 0;
      smokeFailed = smoke.success ? 0 : 1;
      smokeNote = smoke.success
        ? `Smoke test passed; inspect ${relativeToBench(smokeLog)} if needed.`
        : `Smoke test failed; inspect ${relativeToBench(smokeLog)}.`;
    } catch (error) {
      smokeDurationMs = Math.round(performance.now() - started);
      smokePassed = 0;
      smokeFailed = 1;
      smokeNote = `App did not start or smoke runner failed: ${error instanceof Error ? error.message : String(error)}`;
      await Bun.write(smokeLog, `${smokeNote}\nStart log: ${relativeToBench(startLog)}\n`);
    } finally {
      await server?.stop();
    }
  }

  const acceptance = ACCEPTANCE.map((item) => {
    if (item.id === "build-success") return { ...item, pass: build.success, note: relativeToBench(buildLog) };
    if (item.id === "lint-success") return { ...item, pass: lintSummary.success, note: lintSummary.note };
    if (item.id === "convention-success") return { ...item, pass: convention.success, note: convention.note };
    if (item.id === "smoke-success") return { ...item, pass: smokeSuccess, note: smokeNote };
    return {
      ...item,
      pass: build.success && lintSummary.success && convention.success && smokeSuccess,
      note: build.success && lintSummary.success && convention.success && smokeSuccess ? undefined : smokeNote,
    };
  });

  const summary: VerificationSummary = {
    stack: stack.id,
    runId,
    build: {
      success: build.success,
      durationMs: build.durationMs,
      command: stack.buildCommand,
      logFile: relativeToBench(buildLog),
    },
    tests: {
      success: smokeSuccess,
      durationMs: smokeDurationMs,
      command: SMOKE_COMMAND,
      passed: smokePassed,
      failed: smokeFailed,
      logFile: relativeToBench(smokeLog),
    },
    lint: lintSummary,
    convention,
    acceptance,
  };
  await writeJson(verificationPath(runId, stack.id), summary);
  console.info(`Verification written: ${relativeToBench(verificationPath(runId, stack.id))}`);

  if (!build.success || !lintSummary.success || !convention.success || !smokeSuccess) process.exit(1);
};

await main();
