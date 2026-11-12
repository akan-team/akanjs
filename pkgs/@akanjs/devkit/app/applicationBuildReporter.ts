import { Logger } from "akanjs/common";
import { ErrorReport } from "../util/errorReport";
import { RouteJsBudget, type RouteJsBudgetWarning, type RouteJsSize } from "./routeJsBudget";

export interface ApplicationBuildPhaseResult {
  id: string;
  label: string;
  durationMs: number;
  summary?: string;
  skipped?: boolean;
}

export interface ApplicationBuildResult {
  phases: ApplicationBuildPhaseResult[];
  durationMs: number;
  outputDir: string;
  artifactDir: string;
  environment: string;
  routeJs?: RouteJsSize[];
  routeJsWarnings?: RouteJsBudgetWarning[];
}

export interface ApplicationBuildProgressReporter {
  phaseStart?(phase: Pick<ApplicationBuildPhaseResult, "id" | "label">): void;
  phaseDone?(phase: ApplicationBuildPhaseResult): void;
  phaseFail?(phase: Pick<ApplicationBuildPhaseResult, "id" | "label">, error: unknown): void;
}

export class ApplicationBuildReporter {
  static create(): ApplicationBuildProgressReporter {
    return {
      phaseDone: (phase) => Logger.rawLog(ApplicationBuildReporter.formatPhaseLine(phase)),
    };
  }

  static printSummary(result: ApplicationBuildResult) {
    Logger.rawLog("");
    if (result.routeJs?.length) {
      for (const line of RouteJsBudget.formatTable(result.routeJs)) Logger.rawLog(line);
      Logger.rawLog("");
    }
    if (result.routeJsWarnings?.length) {
      ApplicationBuildReporter.printRouteJsWarnings(result);
      Logger.rawLog("");
    }
    Logger.rawLog(`Route artifacts: ${result.artifactDir}`);
    Logger.rawLog(`Server output: ${result.outputDir}`);
    Logger.rawLog(`Done in ${ApplicationBuildReporter.formatDuration(result.durationMs)}`);
    if (result.environment === "local") Logger.rawLog(ApplicationBuildReporter.localBuildNotice);
  }

  static printRouteJsWarnings({ routeJsWarnings = [] }: Pick<ApplicationBuildResult, "routeJsWarnings">) {
    for (const { file, message, fix } of routeJsWarnings) Logger.rawLog(`Warning: ${file}: ${message} (${fix})`);
  }

  static readonly localBuildNotice =
    "Built for local: the server runs without endpoint rate limits, and boots on local defaults (Redis on localhost, the first database mode) where a deployment would stop to ask. For a host others can reach, run `akan build <app> --env main` with AKAN_PUBLIC_REPO_NAME and AKAN_PUBLIC_SERVE_DOMAIN set in the shell or the workspace .env.";

  static formatError(error: unknown, workspaceRoot = process.cwd()): string {
    return ErrorReport.format(error, workspaceRoot);
  }

  static formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${Math.round(ms / 100) / 10}s`;
    const seconds = Math.floor(ms / 1000);
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }

  static formatPhaseLine(phase: ApplicationBuildPhaseResult): string {
    const summary = phase.summary ? `: ${phase.summary}` : "";
    return `✓ ${phase.label}${summary} (${ApplicationBuildReporter.formatDuration(phase.durationMs)})`;
  }
}
