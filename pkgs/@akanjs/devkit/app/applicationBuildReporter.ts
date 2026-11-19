import { Logger } from "akanjs/common";
import { ErrorReport } from "../util/errorReport";
import { DictionarySizes } from "./dictionarySizes";
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
      phaseFail: (phase) => Logger.rawLog(`✗ ${phase.label} failed`, undefined, "error"),
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
    const dictionaries = DictionarySizes.of(result.artifactDir);
    for (const size of dictionaries) Logger.rawLog(DictionarySizes.format(size));
    if (dictionaries.length) Logger.rawLog("");
    Logger.rawLog(`Route artifacts: ${result.artifactDir}`);
    Logger.rawLog(`Server output: ${result.outputDir}`);
    Logger.rawLog(`Done in ${ApplicationBuildReporter.formatDuration(result.durationMs)}`);
    if (result.environment === "local") Logger.rawLog(ApplicationBuildReporter.localBuildNotice);
  }

  static printRouteJsWarnings({ routeJsWarnings = [] }: Pick<ApplicationBuildResult, "routeJsWarnings">) {
    for (const { file, message, fix } of routeJsWarnings) Logger.rawLog(`Warning: ${file}: ${message} (${fix})`);
  }

  static readonly localBuildNotice =
    "Built for local: no endpoint rate limits, Redis on localhost and the first database mode. For a host others can reach, `akan build <app> --env main` with AKAN_PUBLIC_REPO_NAME and AKAN_PUBLIC_SERVE_DOMAIN set.";

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
