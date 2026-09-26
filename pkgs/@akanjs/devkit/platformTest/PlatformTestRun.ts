import path from "node:path";
import chalk from "chalk";
import type { TestTargetsConfig } from "../cloud/constants";
import { GlobalConfig } from "../cloud/globalConfig";
import { LinuxDockerTarget } from "./LinuxDockerTarget";
import { type PlatformTestResult, PlatformTestTarget, type RemoteTestPlatform } from "./PlatformTestTarget";
import { TestSnapshot } from "./TestSnapshot";
import { WindowsSshTarget } from "./WindowsSshTarget";

interface PlatformTestRunOptions {
  workspaceRoot: string;
  platforms: RemoteTestPlatform[];
  pkgs: string[];
  targets: TestTargetsConfig;
  onProgress: (message: string) => void;
}

export interface PlatformVerdict {
  blocking: PlatformTestResult[];
  warning: PlatformTestResult[];
}

export class PlatformTestRun {
  //? The CLI refuses a root without these, and the cli suite builds temp workspaces from them; none is a secret.
  static readonly envKeys = [
    "USE_AKANJS_PKGS",
    "AKAN_PUBLIC_REPO_NAME",
    "AKAN_PUBLIC_SERVE_DOMAIN",
    "AKAN_PUBLIC_ENV",
    "AKAN_PUBLIC_OPERATION_MODE",
    "APP_OPERATION_MODE",
    "SERVER_MODE",
  ] as const;
  static readonly promoteAfterGreenRuns = 3;

  readonly runId: string;
  readonly logDir: string;
  readonly snapshot: TestSnapshot;
  readonly #results: Promise<PlatformTestResult[]>;

  constructor(runId: string, logDir: string, snapshot: TestSnapshot, results: Promise<PlatformTestResult[]>) {
    this.runId = runId;
    this.logDir = logDir;
    this.snapshot = snapshot;
    this.#results = results;
  }

  static async start({ workspaceRoot, platforms, pkgs, targets, onProgress }: PlatformTestRunOptions) {
    const runId = PlatformTestRun.newRunId();
    const logDir = path.join(workspaceRoot, "local", "deploy-test", runId);
    const snapshot = await TestSnapshot.create(workspaceRoot, logDir);
    const envPath = path.join(logDir, "env");
    await Bun.write(envPath, await PlatformTestRun.allowlistedEnv(workspaceRoot));
    const instances = platforms.map((platform) => {
      if (platform === "linux") return new LinuxDockerTarget(targets.linux);
      if (!targets.windows) throw new Error("the windows test target is not configured");
      return new WindowsSshTarget(targets.windows);
    });
    const results = Promise.all(
      instances.map((target) => target.run({ snapshot, envPath, runId, logDir, pkgs, onProgress })),
    );
    return new PlatformTestRun(runId, logDir, snapshot, results);
  }

  async results() {
    return await this.#results;
  }

  static parsePlatforms(value: string): RemoteTestPlatform[] {
    const names = value
      .split(",")
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name && name !== "none");
    const unknown = names.filter((name) => name !== "linux" && name !== "windows");
    if (unknown.length)
      throw new Error(`Unknown test platform: ${unknown.join(", ")} (expected linux, windows, or none)`);
    return [...new Set(names as RemoteTestPlatform[])];
  }

  static newRunId(now = new Date()) {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  }

  static async allowlistedEnv(workspaceRoot: string) {
    const envFile = Bun.file(path.join(workspaceRoot, ".env"));
    const lines = (await envFile.exists()) ? (await envFile.text()).split(/\r?\n/) : [];
    const allowed = new Set<string>(PlatformTestRun.envKeys);
    const kept = lines.filter((line) => allowed.has(line.split("=", 1)[0]?.trim() ?? ""));
    return `${kept.join("\n")}\n`;
  }

  static failed(result: PlatformTestResult) {
    return !!result.infraError || result.packages.some((pkg) => pkg.status !== "pass");
  }

  static verdict(results: PlatformTestResult[]): PlatformVerdict {
    const failed = results.filter((result) => PlatformTestRun.failed(result));
    return {
      blocking: failed.filter((result) => result.policy === "gate"),
      warning: failed.filter((result) => result.policy === "warn"),
    };
  }

  format(results: PlatformTestResult[], { maxFailures = 15 }: { maxFailures?: number } = {}) {
    const lines = [
      chalk.bold(
        `Platform tests · snapshot ${this.snapshot.digest} (${this.snapshot.fileCount} files) · ${path.relative(this.snapshot.root, this.logDir)}`,
      ),
    ];
    for (const result of results) {
      const mark = PlatformTestRun.failed(result) ? chalk.red("✖") : chalk.green("✔");
      lines.push(`${mark} ${result.platform} (${result.policy}, ${Math.round(result.ms / 1000)}s)`);
      if (result.infraError) lines.push(chalk.red(`    setup: ${result.infraError}`));
      for (const warning of result.envWarnings) lines.push(chalk.yellow(`    env: ${warning}`));
      for (const pkg of result.packages) {
        const line = `    ${PlatformTestTarget.describe(pkg)}`;
        lines.push(pkg.status === "pass" ? line : chalk.red(line));
        for (const failure of pkg.report.failures.slice(0, maxFailures))
          lines.push(chalk.dim(`      ${failure.file ? `${failure.file} › ` : ""}${failure.name}`));
        if (pkg.report.failures.length > maxFailures)
          lines.push(chalk.dim(`      … ${pkg.report.failures.length - maxFailures} more in ${pkg.logPath}`));
      }
    }
    return lines.join("\n");
  }

  /** A `warn` platform becomes a gate once it has been green for enough deploys in a row. */
  static async recordStreaks(results: PlatformTestResult[]) {
    const targets = await GlobalConfig.getTestTargets();
    const windows = targets.windows;
    const result = results.find((one) => one.platform === "windows");
    if (!windows || !result || (windows.policy ?? "warn") !== "warn") return null;
    const greenStreak = PlatformTestRun.failed(result) ? 0 : (windows.greenStreak ?? 0) + 1;
    const promoted = greenStreak >= PlatformTestRun.promoteAfterGreenRuns;
    await GlobalConfig.setTestTargets({
      windows: { ...windows, greenStreak, ...(promoted ? { policy: "gate" } : {}) },
    });
    return { platform: "windows" as const, greenStreak, promoted };
  }
}
