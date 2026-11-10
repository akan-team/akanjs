import { realpathSync } from "node:fs";
import path from "node:path";
import { Logger } from "akanjs/common";
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
    Logger.rawLog(`Route artifacts: ${result.artifactDir}`);
    Logger.rawLog(`Server output: ${result.outputDir}`);
    Logger.rawLog(`Done in ${ApplicationBuildReporter.formatDuration(result.durationMs)}`);
    if (result.environment === "local") Logger.rawLog(ApplicationBuildReporter.localBuildNotice);
  }

  static readonly localBuildNotice =
    "Built for local: the server runs without endpoint rate limits, and boots on local defaults (Redis on localhost, the first database mode) where a deployment would stop to ask. For a host others can reach, run `akan build <app> --env main` with AKAN_PUBLIC_REPO_NAME and AKAN_PUBLIC_SERVE_DOMAIN set in the workspace .env.";

  static formatError(error: unknown, workspaceRoot = process.cwd()): string {
    if (error instanceof AggregateError) {
      const nestedMessages = error.errors
        .map(
          (nestedError, index) =>
            ApplicationBuildReporter.formatError(nestedError, workspaceRoot).trim() || `Unknown error ${index + 1}`,
        )
        .map((message) => message.replace(/^/gm, "  "))
        .join("\n");

      return nestedMessages ? `${error.message}\n${nestedMessages}` : error.message;
    }
    if (error instanceof Error) {
      const causeMessage = error.cause
        ? `\nCaused by: ${ApplicationBuildReporter.formatError(error.cause, workspaceRoot)}`
        : "";
      return `${ApplicationBuildReporter.#withLocation(error.message, error, workspaceRoot)}${causeMessage}`;
    }
    if (typeof error === "object" && error !== null && "message" in error)
      return ApplicationBuildReporter.#withLocation(String(error.message), error, workspaceRoot);
    return String(error);
  }

  static #withLocation(message: string, error: object, workspaceRoot: string): string {
    const { position } = error as { position?: { file: string; line: number; column: number } | null };
    if (!position?.file) return message;
    const file = ApplicationBuildReporter.#relativeToWorkspace(position.file, workspaceRoot);
    const location = position.line > 0 ? `${file}:${position.line}:${position.column}` : file;
    return message.includes(location) ? message : message.replace(/^.*/, (headline) => `${headline} (${location})`);
  }

  // Bun names the file by its realpath, so a workspace root reached through a symlink is matched by its own too.
  static #relativeToWorkspace(file: string, workspaceRoot: string): string {
    if (!path.isAbsolute(file)) return file;
    for (const root of [workspaceRoot, ApplicationBuildReporter.#realpathOf(workspaceRoot)]) {
      const relative = path.relative(root, file);
      if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
        return relative.replaceAll(path.sep, "/");
    }
    return file;
  }

  static #realpathOf(dir: string): string {
    try {
      return realpathSync(dir);
    } catch {
      return dir;
    }
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
