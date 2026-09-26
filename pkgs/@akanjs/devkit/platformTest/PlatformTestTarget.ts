import path from "node:path";
import type { PlatformGatePolicy } from "../cloud/constants";
import { BunTestReport } from "./BunTestReport";
import type { IdleWatchedResult } from "./IdleWatchedProcess";
import type { TestSnapshot } from "./TestSnapshot";

export type RemoteTestPlatform = "linux" | "windows";
export type PackageTestStatus = "pass" | "fail" | "hung";

export interface PackageTestResult {
  pkg: string;
  status: PackageTestStatus;
  report: BunTestReport;
  ms: number;
  logPath: string;
}

export interface PlatformTestResult {
  platform: RemoteTestPlatform;
  policy: PlatformGatePolicy;
  packages: PackageTestResult[];
  envWarnings: string[];
  infraError: string | null;
  ms: number;
}

export interface PlatformRunContext {
  snapshot: TestSnapshot;
  envPath: string;
  runId: string;
  logDir: string;
  pkgs: string[];
  onProgress: (message: string) => void;
}

export abstract class PlatformTestTarget {
  static readonly installIdleMs = 5 * 60_000;
  static readonly testIdleMs = 2 * 60_000;

  abstract readonly platform: RemoteTestPlatform;
  abstract readonly policy: PlatformGatePolicy;
  protected readonly tolerateScriptFailures: string[] = [];

  protected abstract prepare(context: PlatformRunContext): Promise<void>;
  protected abstract exec(command: string, logPath: string, idleMs: number): Promise<IdleWatchedResult>;
  protected abstract cleanup(context: PlatformRunContext): Promise<void>;

  async run(context: PlatformRunContext): Promise<PlatformTestResult> {
    const startedAt = performance.now();
    const envWarnings: string[] = [];
    const packages: PackageTestResult[] = [];
    const result = (infraError: string | null): PlatformTestResult => ({
      platform: this.platform,
      policy: this.policy,
      packages,
      envWarnings,
      infraError,
      ms: performance.now() - startedAt,
    });
    try {
      await this.prepare(context);
      await this.#install(context, envWarnings);
      const build = await this.exec(
        "bun run buildAkan",
        this.#logPath(context, "build"),
        PlatformTestTarget.installIdleMs,
      );
      if (build.exitCode !== 0) throw new Error(`buildAkan failed — see ${this.#logPath(context, "build")}`);
      for (const pkg of context.pkgs) {
        const logPath = this.#logPath(context, `test-${pkg.replaceAll("/", "__")}`);
        const run = await this.exec(
          `bun dist/pkgs/@akanjs/cli/index.js test ${pkg}`,
          logPath,
          PlatformTestTarget.testIdleMs,
        );
        const report = new BunTestReport(run.output);
        const status: PackageTestStatus =
          run.hung || run.timedOut ? "hung" : report.passed && run.exitCode === 0 ? "pass" : "fail";
        packages.push({ pkg, status, report, ms: run.ms, logPath });
        context.onProgress(`[${this.platform}] ${PlatformTestTarget.describe(packages.at(-1) as PackageTestResult)}`);
      }
      return result(null);
    } catch (error) {
      return result(error instanceof Error ? error.message : String(error));
    } finally {
      await this.cleanup(context).catch(() => undefined);
    }
  }

  static describe({ pkg, status, report, ms }: PackageTestResult) {
    const seconds = `${Math.round(ms / 1000)}s`;
    if (status === "hung") return `${pkg}: hung${report.lastFile ? ` in ${report.lastFile}` : ""} (${seconds})`;
    return `${pkg}: ${report.pass} pass / ${report.fail} fail${report.errors ? ` / ${report.errors} errors` : ""} (${seconds})`;
  }

  async #install(context: PlatformRunContext, envWarnings: string[]) {
    const logPath = this.#logPath(context, "install");
    const install = await this.exec("bun install --frozen-lockfile", logPath, PlatformTestTarget.installIdleMs);
    if (install.exitCode === 0) return;
    const failedScripts = [...install.output.matchAll(/(?:pre|post)?install script from "([^"]+)" exited/g)].map(
      (match) => match[1] ?? "",
    );
    const tolerable =
      failedScripts.length > 0 && failedScripts.every((pkg) => this.tolerateScriptFailures.includes(pkg));
    if (!tolerable) throw new Error(`bun install failed — see ${logPath}`);
    //* A failed lifecycle script makes bun skip linking the workspace root's `.bin`, so every tool the suites
    //* spawn from there disappears; a second pass without scripts links them.
    envWarnings.push(`install script failed for ${failedScripts.join(", ")} — tolerated on ${this.platform}`);
    const relink = await this.exec(
      "bun install --frozen-lockfile --ignore-scripts",
      this.#logPath(context, "install-relink"),
      PlatformTestTarget.installIdleMs,
    );
    if (relink.exitCode !== 0) throw new Error(`bun install --ignore-scripts failed — see ${logPath}`);
  }

  #logPath(context: PlatformRunContext, name: string) {
    return path.join(context.logDir, this.platform, `${name}.log`);
  }
}
