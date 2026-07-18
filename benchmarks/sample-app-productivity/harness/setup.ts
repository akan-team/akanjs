#!/usr/bin/env bun
import { rm } from "node:fs/promises";
import path from "node:path";
import {
  BENCH_ROOT,
  ensureDir,
  findFirstExisting,
  getByPath,
  hashFile,
  loadStackConfig,
  parseArgs,
  pathExists,
  RESULTS_DIR,
  readJson,
  readPackageVersions,
  relativeToBench,
  renderCommand,
  runCommand,
  type StackConfig,
  setupPath,
  workspacePath,
  writeJson,
} from "./lib";

const LOCKFILES = ["bun.lock", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"];

const renderTemplate = (template: string, vars: Record<string, string>) =>
  Object.entries(vars).reduce((current, [key, value]) => current.replaceAll(`{{${key}}}`, value), template);

const allowedPackageText = (stack: StackConfig) => stack.allowedPackages.map((pkg) => `- ${pkg}`).join("\n");

const readPromptAppendix = async (stack: StackConfig, vars: Record<string, string>) => {
  if (!stack.promptAppendix) return "";
  const appendixPath = path.isAbsolute(stack.promptAppendix)
    ? stack.promptAppendix
    : path.join(BENCH_ROOT, stack.promptAppendix);
  const appendix = await Bun.file(appendixPath).text();
  return renderTemplate(appendix, vars).trim();
};

const writeWorkspaceDocs = async (stack: StackConfig, scenario: string, runId: string, workspace: string) => {
  const scenarioDir = path.join(BENCH_ROOT, "scenarios", scenario);
  const requirements = await Bun.file(path.join(scenarioDir, "requirements.md")).text();
  const repairLoop = await Bun.file(path.join(scenarioDir, "repair-loop.md")).text();
  const promptTemplate = await Bun.file(path.join(scenarioDir, "prompt.md")).text();
  const promptVars = {
    stackLabel: stack.label,
    allowedPackages: allowedPackageText(stack),
  };
  const basePrompt = renderTemplate(promptTemplate, promptVars).trim();
  const appendix = await readPromptAppendix(stack, promptVars);
  const prompt = [basePrompt, appendix].filter(Boolean).join("\n\n");
  const runbook = `# Benchmark Runbook

Stack: ${stack.label}
Scenario: ${scenario}
Run ID: ${runId}

## Manual Cursor Steps

1. Open this directory as its own Cursor workspace.
2. Start one agent run using \`BENCHMARK_PROMPT.md\` exactly as written.
3. Do not add framework hints or product requirements beyond \`BENCHMARK_PROMPT.md\`; any stack-specific appendix is already included there.
4. If build or smoke verification fails, follow \`REPAIR_LOOP.md\` for at most three repair prompts.
5. Save token and timing metadata as \`cursor-report.json\`. Use \`schemas/cursor-report.example.json\` as the stable shape when no direct export is available.
6. Run verification and collection from the benchmark package:

\`\`\`bash
cd ${BENCH_ROOT}
bun harness/verify.ts --run ${runId} --stack ${stack.id}
bun harness/collect.ts --run ${runId} --stack ${stack.id} --cursor-report ${relativeToBench(path.join(workspace, "cursor-report.json"))}
\`\`\`

## Benchmark Commands

- Build: \`${stack.buildCommand.join(" ")}\`
- Lint: \`${stack.lintCommand?.join(" ") ?? "not configured"}\`
- Convention check: \`${stack.conventionCheck ?? "not configured"}\`
- Start: \`${stack.startCommand.join(" ")}\`
- Base URL: \`${stack.baseUrl}\`

If verification fails, use only the failed command, raw log, and failed acceptance list as repair input.
`;

  await Bun.write(path.join(workspace, "REQUIREMENTS.md"), requirements);
  await Bun.write(path.join(workspace, "BENCHMARK_PROMPT.md"), prompt);
  await Bun.write(path.join(workspace, "REPAIR_LOOP.md"), repairLoop);
  await Bun.write(path.join(workspace, "RUNBOOK.md"), runbook);
};

const verifyStackVersions = async (stack: StackConfig, workspace: string) => {
  const failures: Array<{ file: string; path: string; expected: string; actual: unknown }> = [];
  for (const check of stack.versionChecks) {
    const json = await readJson<unknown>(path.join(workspace, check.file));
    const actual = getByPath(json, check.path);
    if (actual !== check.expected) failures.push({ ...check, actual });
  }
  return failures;
};

const initBaselineGit = async (workspace: string) => {
  if (await pathExists(path.join(workspace, ".git"))) return;
  await runCommand(["git", "init"], { cwd: workspace });
  await runCommand(["git", "add", "."], { cwd: workspace });
  await runCommand(
    [
      "git",
      "-c",
      "user.name=Akan Benchmark",
      "-c",
      "user.email=benchmark@akanjs.com",
      "commit",
      "-m",
      "benchmark starter baseline",
    ],
    { cwd: workspace },
  );
};

const setupStack = async ({
  runId,
  scenario,
  stack,
  force,
  skipCommands,
}: {
  runId: string;
  scenario: string;
  stack: StackConfig;
  force: boolean;
  skipCommands: boolean;
}) => {
  const workspace = workspacePath(runId, stack.id);
  if (await pathExists(workspace)) {
    if (!force) {
      throw new Error(
        `${relativeToBench(workspace)} already exists. Use --force only after removing it intentionally.`,
      );
    }
    await rm(workspace, { recursive: true, force: true });
  }
  await ensureDir(path.dirname(workspace));

  const commands: Array<{ command: string[]; cwd: string; success: boolean; durationMs: number; skipped?: boolean }> =
    [];
  const started = Date.now();
  const vars = {
    workspacePath: workspace,
    // `create-akan-workspace` joins dirname with process.cwd(), so absolute dirs
    // would be treated as nested paths under BENCH_ROOT.
    workspaceParentPath: relativeToBench(path.dirname(workspace)),
  };

  if (!skipCommands) {
    for (const spec of stack.setup) {
      const rendered = renderCommand(spec, vars);
      const command = [rendered.cmd, ...rendered.args];
      const cwd = rendered.cwd ?? BENCH_ROOT;
      const result = await runCommand(command, { cwd, env: rendered.env });
      commands.push({ command, cwd, success: result.success, durationMs: result.durationMs });
      if (!result.success) throw new Error(`Setup failed for ${stack.id}: ${command.join(" ")}`);
    }
  } else {
    await ensureDir(workspace);
    for (const spec of stack.setup) {
      const rendered = renderCommand(spec, vars);
      commands.push({
        command: [rendered.cmd, ...rendered.args],
        cwd: rendered.cwd ?? BENCH_ROOT,
        success: true,
        durationMs: 0,
        skipped: true,
      });
    }
  }

  await writeWorkspaceDocs(stack, scenario, runId, workspace);
  const versionFailures = skipCommands ? [] : await verifyStackVersions(stack, workspace);
  if (versionFailures.length) {
    throw new Error(`Version check failed for ${stack.id}: ${JSON.stringify(versionFailures)}`);
  }

  if (!skipCommands) await initBaselineGit(workspace);

  const lockfile = await findFirstExisting(workspace, LOCKFILES);
  const packages = await readPackageVersions(workspace);
  const record = {
    runId,
    scenario,
    stack: stack.id,
    stackLabel: stack.label,
    workspacePath: relativeToBench(workspace),
    packagePolicy: stack.packagePolicy,
    commands,
    installMs: Date.now() - started,
    lockfile: lockfile ? path.relative(workspace, lockfile) : null,
    lockfileHash: lockfile ? await hashFile(lockfile) : null,
    packages,
    cursorCommand: `cursor ${workspace}`,
    versionFailures,
  };
  await writeJson(setupPath(runId, stack.id), record);
  return record;
};

const main = async () => {
  const args = parseArgs({ scenario: "team-task-board", run: new Date().toISOString().replace(/[:.]/g, "-") });
  const runId = String(args["run-id"] ?? args.run);
  const scenario = String(args.scenario);
  const selectedStack = args.stack ? String(args.stack) : null;
  const all = Boolean(args.all);
  const force = Boolean(args.force);
  const skipCommands = Boolean(args["skip-commands"]);

  const config = await loadStackConfig();
  const stacks = all ? config.stacks : config.stacks.filter((stack) => stack.id === selectedStack);
  if (!stacks.length) {
    throw new Error("No stack selected. Use --all or --stack <stackId>.");
  }
  await ensureDir(path.join(RESULTS_DIR, runId));

  const records = [];
  for (const stack of stacks) {
    console.info(`Setting up ${stack.id} in ${relativeToBench(workspacePath(runId, stack.id))}`);
    records.push(await setupStack({ runId, scenario, stack, force, skipCommands }));
  }
  await writeJson(path.join(RESULTS_DIR, runId, "setup.summary.json"), { runId, scenario, stacks: records });
  console.info(`Setup complete: ${relativeToBench(path.join(RESULTS_DIR, runId))}`);
};

await main();
