import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";

type BiomeSeverity = "error" | "warning" | "information" | "hint";

interface BiomePosition {
  line: number;
  column: number;
}

interface BiomeDiagnostic {
  severity: BiomeSeverity;
  message: string;
  category?: string;
  location?: {
    path?: string;
    start?: BiomePosition;
    end?: BiomePosition;
  };
}

interface BiomeReport {
  summary?: {
    changed?: number;
    errors?: number;
    warnings?: number;
    infos?: number;
  };
  diagnostics?: BiomeDiagnostic[];
}

interface LintMessage {
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  ruleId: string | null;
  severity: 1 | 2;
}

interface LintResult {
  filePath: string;
  messages: LintMessage[];
  errorCount: number;
  warningCount: number;
  fixableErrorCount: number;
  fixableWarningCount: number;
}

interface LintResponse {
  fixed: boolean;
  output?: string;
  results: LintResult[];
  errors: LintMessage[];
  warnings: LintMessage[];
}

export class Linter {
  lintRoot: string;
  #biomeBin: string;

  constructor(cwdPath: string) {
    this.lintRoot = this.#findBiomeRootPath(cwdPath);
    const localBiomeBin = path.join(this.lintRoot, "node_modules/.bin/biome");
    this.#biomeBin = existsSync(localBiomeBin) ? localBiomeBin : "biome";
  }

  #findBiomeRootPath(dir: string): string {
    const configPath = path.join(dir, "biome.json");
    if (existsSync(configPath)) return dir;
    const parentDir = path.dirname(dir);
    if (parentDir === dir) throw new Error(`biome.json not found from ${dir}`);
    return this.#findBiomeRootPath(parentDir);
  }

  #toBiomePath(filePath: string): string {
    const relativePath = path.relative(this.lintRoot, filePath);
    if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) return relativePath;
    return filePath;
  }

  #resolveFilePath(filePath: string): string {
    return path.isAbsolute(filePath) ? filePath : path.join(this.lintRoot, filePath);
  }

  async #runBiome(args: string[], input?: string) {
    return await new Promise<{
      stdout: string;
      stderr: string;
      code: number | null;
    }>((resolve, reject) => {
      const proc = spawn(this.#biomeBin, args, {
        cwd: this.lintRoot,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });
      proc.on("error", reject);
      proc.on("close", (code) => resolve({ stdout, stderr, code }));
      proc.stdin.end(input);
    });
  }

  #parseBiomeReport(output: string): BiomeReport {
    const jsonStart = output.indexOf("{");
    const jsonEnd = output.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart)
      throw new Error(output.trim() || "No Biome JSON output");
    return JSON.parse(output.slice(jsonStart, jsonEnd + 1)) as BiomeReport;
  }

  #diagnosticFilePath(diagnostic: BiomeDiagnostic, fallbackFilePath: string) {
    const diagnosticPath = diagnostic.location?.path;
    if (!diagnosticPath) return fallbackFilePath;
    return path.isAbsolute(diagnosticPath) ? diagnosticPath : path.join(this.lintRoot, diagnosticPath);
  }

  #createLintMessage(diagnostic: BiomeDiagnostic): LintMessage {
    const start = diagnostic.location?.start;
    const end = diagnostic.location?.end;
    return {
      line: Math.max(1, start?.line ?? 1),
      column: Math.max(1, start?.column ?? 1),
      endLine: end?.line,
      endColumn: end?.column,
      message: diagnostic.message,
      ruleId: diagnostic.category ?? null,
      severity: diagnostic.severity === "error" ? 2 : 1,
    };
  }

  #toLintResults(report: BiomeReport, filePath: string): LintResult[] {
    const resultsByPath = new Map<string, LintResult>();

    for (const diagnostic of report.diagnostics ?? []) {
      if (diagnostic.severity !== "error" && diagnostic.severity !== "warning") continue;
      const diagnosticFilePath = this.#diagnosticFilePath(diagnostic, filePath);
      const result =
        resultsByPath.get(diagnosticFilePath) ??
        ({
          filePath: diagnosticFilePath,
          messages: [],
          errorCount: 0,
          warningCount: 0,
          fixableErrorCount: 0,
          fixableWarningCount: 0,
        } satisfies LintResult);
      const message = this.#createLintMessage(diagnostic);
      result.messages.push(message);
      if (message.severity === 2) result.errorCount += 1;
      else result.warningCount += 1;
      resultsByPath.set(diagnosticFilePath, result);
    }

    return [
      resultsByPath.get(filePath) ??
        ({
          filePath,
          messages: [],
          errorCount: 0,
          warningCount: 0,
          fixableErrorCount: 0,
          fixableWarningCount: 0,
        } satisfies LintResult),
      ...[...resultsByPath.entries()].filter(([resultPath]) => resultPath !== filePath).map(([, result]) => result),
    ];
  }

  #splitMessages(results: LintResult[]) {
    const messages = results.flatMap((result) => result.messages);
    return {
      errors: messages.filter((message) => message.severity === 2),
      warnings: messages.filter((message) => message.severity === 1),
    };
  }

  async #checkFile(filePath: string, { write = false }: { write?: boolean } = {}): Promise<LintResponse> {
    const originalContent = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
    const { stdout, stderr } = await this.#runBiome([
      "check",
      ...(write ? ["--write"] : []),
      "--reporter=json",
      "--max-diagnostics=none",
      "--no-errors-on-unmatched",
      "--config-path",
      path.join(this.lintRoot, "biome.json"),
      this.#toBiomePath(filePath),
    ]);
    const report = this.#parseBiomeReport(stdout || stderr);
    const results = this.#toLintResults(report, filePath);
    const { errors, warnings } = this.#splitMessages(results);
    const output = write && existsSync(filePath) ? readFileSync(filePath, "utf8") : undefined;

    return {
      fixed: write && output !== originalContent,
      output,
      results,
      errors,
      warnings,
    };
  }

  async lint(filePath: string, { fix = false, dryRun = false }: { fix?: boolean; dryRun?: boolean } = {}) {
    if (fix) return await this.fixFile(filePath, dryRun);
    return await this.lintFile(filePath);
  }

  /**
   * Lint a single file using Biome.
   * @param filePath - Path to the file to lint
   * @returns Array of Biome results in the legacy lint result shape
   */
  async lintFile(filePath: string): Promise<LintResponse> {
    const resolvedFilePath = this.#resolveFilePath(filePath);
    if (!existsSync(resolvedFilePath)) throw new Error(`File not found: ${filePath}`);
    return await this.#checkFile(resolvedFilePath);
  }

  /**
   * Format lint results for console output
   * @param results - Array of Biome results
   * @returns Formatted string
   */
  formatLintResults(results: LintResult[]): string {
    if (results.length === 0) return "No files to lint";

    const output: string[] = [];
    let totalErrors = 0;
    let totalWarnings = 0;

    results.forEach((result) => {
      totalErrors += result.errorCount;
      totalWarnings += result.warningCount;

      if (result.messages.length > 0) {
        output.push(`\n${chalk.cyan(result.filePath)}`);

        let sourceLines: string[] = [];
        if (existsSync(result.filePath)) {
          try {
            const sourceContent = readFileSync(result.filePath, "utf8");
            sourceLines = sourceContent.split("\n");
          } catch {
            // Ignore read errors
          }
        }

        result.messages.forEach((message) => {
          const type = message.severity === 2 ? "error" : "warning";
          const typeColor = message.severity === 2 ? chalk.red : chalk.yellow;
          const icon = message.severity === 2 ? "x" : "!";
          const ruleInfo = message.ruleId ? chalk.dim(` (${message.ruleId})`) : "";

          output.push(`\n  ${icon} ${typeColor(type)}: ${message.message}${ruleInfo}`);
          output.push(`     ${chalk.gray("at")} ${result.filePath}:${chalk.bold(`${message.line}:${message.column}`)}`);

          // Show source line with underline
          if (sourceLines.length > 0 && message.line <= sourceLines.length) {
            const sourceLine = sourceLines[message.line - 1];
            const lineNumber = message.line.toString().padStart(5, " ");

            output.push(`\n${chalk.dim(`${lineNumber} |`)} ${sourceLine}`);

            // Create underline
            const underlinePrefix = " ".repeat(message.column - 1);
            const underlineLength = message.endColumn ? message.endColumn - message.column : 1;
            const underline = "^".repeat(Math.max(1, underlineLength));

            output.push(`${chalk.dim(`${" ".repeat(lineNumber.length)} |`)} ${underlinePrefix}${typeColor(underline)}`);
          }
        });
      }
    });

    if (totalErrors === 0 && totalWarnings === 0) return chalk.bold("No Biome errors or warnings found");

    const errorText = totalErrors > 0 ? chalk.red(`${totalErrors} error(s)`) : "0 errors";
    const warningText = totalWarnings > 0 ? chalk.yellow(`${totalWarnings} warning(s)`) : "0 warnings";
    const summary = [`\n${errorText}, ${warningText} found`];

    return summary.concat(output).join("\n");
  }

  /**
   * Get detailed lint information
   * @param filePath - Path to the file to lint
   * @returns Object containing detailed lint information
   */
  async getDetailedLintInfo(filePath: string): Promise<{
    results: LintResult[];
    details: {
      line: number;
      column: number;
      message: string;
      ruleId: string | null;
      severity: "error" | "warning";
    }[];
    stats: {
      errorCount: number;
      warningCount: number;
      fixableErrorCount: number;
      fixableWarningCount: number;
    };
  }> {
    const { results } = await this.lintFile(filePath);

    const details = results.flatMap((result) =>
      result.messages.map((message) => ({
        line: message.line,
        column: message.column,
        message: message.message,
        ruleId: message.ruleId,
        severity: message.severity === 2 ? ("error" as const) : ("warning" as const),
      })),
    );

    const stats = results.reduce(
      (acc, result) => ({
        errorCount: acc.errorCount + result.errorCount,
        warningCount: acc.warningCount + result.warningCount,
        fixableErrorCount: acc.fixableErrorCount + result.fixableErrorCount,
        fixableWarningCount: acc.fixableWarningCount + result.fixableWarningCount,
      }),
      {
        errorCount: 0,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
      },
    );

    return { results, details, stats };
  }

  /**
   * Check if a file has lint errors
   * @param filePath - Path to the file to check
   * @returns true if there are no errors, false otherwise
   */
  async hasNoLintErrors(filePath: string): Promise<boolean> {
    try {
      const { results } = await this.lintFile(filePath);
      return results.every((result) => result.errorCount === 0);
    } catch {
      return false;
    }
  }

  /**
   * Get only error messages (excluding warnings)
   * @param filePath - Path to the file to lint
   * @returns Array of error messages
   */
  async getErrors(filePath: string): Promise<LintMessage[]> {
    const { results } = await this.lintFile(filePath);
    return results.flatMap((result) => result.messages.filter((message) => message.severity === 2));
  }

  /**
   * Get only warning messages
   * @param filePath - Path to the file to lint
   * @returns Array of warning messages
   */
  async getWarnings(filePath: string): Promise<LintMessage[]> {
    const { results } = await this.lintFile(filePath);
    return results.flatMap((result) => result.messages.filter((message) => message.severity === 1));
  }

  /**
   * Fix lint errors automatically
   * @param filePath - Path to the file to fix
   * @param dryRun - If true, returns the fixed content without writing to file
   * @returns Fixed content and remaining issues
   */
  async fixFile(filePath: string, dryRun = false): Promise<LintResponse> {
    const resolvedFilePath = this.#resolveFilePath(filePath);
    if (!existsSync(resolvedFilePath)) throw new Error(`File not found: ${filePath}`);

    if (!dryRun) return await this.#checkFile(resolvedFilePath, { write: true });

    const source = readFileSync(resolvedFilePath, "utf8");
    const { stdout } = await this.#runBiome(
      [
        "check",
        "--write",
        "--config-path",
        path.join(this.lintRoot, "biome.json"),
        "--stdin-file-path",
        this.#toBiomePath(resolvedFilePath),
      ],
      source,
    );
    const lintResult = await this.lintFile(resolvedFilePath);
    return { ...lintResult, fixed: stdout !== source, output: stdout };
  }

  /**
   * Get Biome configuration for a file
   * @param filePath - Path to the file
   * @returns Biome configuration object
   */
  async getConfigForFile(filePath: string): Promise<unknown> {
    const resolvedFilePath = this.#resolveFilePath(filePath);
    if (!existsSync(resolvedFilePath)) throw new Error(`File not found: ${filePath}`);
    return JSON.parse(readFileSync(path.join(this.lintRoot, "biome.json"), "utf8")) as unknown;
  }

  /**
   * Get rules that are causing errors in a file
   * @param filePath - Path to the file to check
   * @returns Object mapping rule IDs to their error counts
   */
  async getProblematicRules(filePath: string): Promise<Record<string, number>> {
    const { results } = await this.lintFile(filePath);
    const ruleCounts: Record<string, number> = {};

    results.forEach((result) => {
      result.messages.forEach((message) => {
        if (message.ruleId) ruleCounts[message.ruleId] = (ruleCounts[message.ruleId] || 0) + 1;
      });
    });

    return ruleCounts;
  }
}
