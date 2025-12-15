import { Logger } from "@akanjs/common";
import chalk from "chalk";
import { ESLint, type Linter as ESLintLinter } from "eslint";
import * as fs from "fs";
import * as path from "path";

export class Linter {
  #logger = new Logger("Linter");
  #eslint: ESLint;
  lintRoot: string;

  constructor(cwdPath: string) {
    this.lintRoot = this.#findEslintRootPath(cwdPath);
    this.#eslint = new ESLint({ cwd: this.lintRoot, errorOnUnmatchedPattern: false });
  }
  #findEslintRootPath(dir: string): string {
    const configPath = path.join(dir, "eslint.config.ts");
    if (fs.existsSync(configPath)) return dir;
    const parentDir = path.dirname(dir);
    return this.#findEslintRootPath(parentDir);
  }
  async lint(filePath: string, { fix = false, dryRun = false }: { fix?: boolean; dryRun?: boolean } = {}) {
    if (fix) return await this.fixFile(filePath, dryRun);
    return await this.lintFile(filePath);
  }

  /**
   * Lint a single file using ESLint
   * @param filePath - Path to the file to lint
   * @returns Array of ESLint results
   */
  async lintFile(filePath: string): Promise<{
    fixed: boolean;
    output?: string;
    results: ESLint.LintResult[];
    errors: ESLintLinter.LintMessage[];
    warnings: ESLintLinter.LintMessage[];
  }> {
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    const isIgnored = await this.#eslint.isPathIgnored(filePath);
    if (isIgnored) {
      this.#logger.warn(`File ${filePath} is ignored by ESLint configuration`);
      return { fixed: false, results: [], errors: [], warnings: [] };
    }
    const results = await this.#eslint.lintFiles([filePath]);
    const errors = results.flatMap((result) => result.messages.filter((message) => message.severity === 2));
    const warnings = results.flatMap((result) => result.messages.filter((message) => message.severity === 1));
    return { fixed: false, results, errors, warnings };
  }

  /**
   * Format lint results for console output
   * @param results - Array of ESLint results
   * @returns Formatted string
   */
  formatLintResults(results: ESLint.LintResult[]): string {
    if (results.length === 0) return "No files to lint";

    const output: string[] = [];
    let totalErrors = 0;
    let totalWarnings = 0;

    results.forEach((result) => {
      totalErrors += result.errorCount;
      totalWarnings += result.warningCount;

      if (result.messages.length > 0) {
        output.push(`\n${chalk.cyan(result.filePath)}`);

        // Read source file once
        let sourceLines: string[] = [];
        if (fs.existsSync(result.filePath)) {
          try {
            const sourceContent = fs.readFileSync(result.filePath, "utf8");
            sourceLines = sourceContent.split("\n");
          } catch (error) {
            // Ignore read errors
          }
        }

        result.messages.forEach((message) => {
          const type = message.severity === 2 ? "error" : "warning";
          const typeColor = message.severity === 2 ? chalk.red : chalk.yellow;
          const icon = message.severity === 2 ? "❌" : "⚠️";
          const ruleInfo = message.ruleId ? chalk.dim(` (${message.ruleId})`) : "";

          output.push(`\n  ${icon} ${typeColor(type)}: ${message.message}${ruleInfo}`);
          output.push(`     ${chalk.gray("at")} ${result.filePath}:${chalk.bold(`${message.line}:${message.column}`)}`);

          // Show source line with underline
          if (sourceLines.length > 0 && message.line <= sourceLines.length) {
            const sourceLine = sourceLines[message.line - 1];
            const lineNumber = message.line.toString().padStart(5, " ");

            output.push(`\n${chalk.dim(lineNumber + " |")} ${sourceLine}`);

            // Create underline
            const underlinePrefix = " ".repeat(message.column - 1);
            const underlineLength = message.endColumn ? message.endColumn - message.column : 1;
            const underline = "^".repeat(Math.max(1, underlineLength));

            output.push(`${chalk.dim(" ".repeat(lineNumber.length) + " |")} ${underlinePrefix}${typeColor(underline)}`);
          }
        });
      }
    });

    if (totalErrors === 0 && totalWarnings === 0) return chalk.bold("✅ No ESLint errors or warnings found");

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
    results: ESLint.LintResult[];
    details: {
      line: number;
      column: number;
      message: string;
      ruleId: string | null;
      severity: "error" | "warning";
      fix?: {
        range: [number, number];
        text: string;
      };
      suggestions?: {
        desc: string;
        fix: {
          range: [number, number];
          text: string;
        };
      }[];
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
        fix: message.fix,
        suggestions: message.suggestions,
      }))
    );

    const stats = results.reduce(
      (acc, result) => ({
        errorCount: acc.errorCount + result.errorCount,
        warningCount: acc.warningCount + result.warningCount,
        fixableErrorCount: acc.fixableErrorCount + result.fixableErrorCount,
        fixableWarningCount: acc.fixableWarningCount + result.fixableWarningCount,
      }),
      { errorCount: 0, warningCount: 0, fixableErrorCount: 0, fixableWarningCount: 0 }
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
    } catch (error) {
      return false;
    }
  }

  /**
   * Get only error messages (excluding warnings)
   * @param filePath - Path to the file to lint
   * @returns Array of error messages
   */
  async getErrors(filePath: string): Promise<ESLintLinter.LintMessage[]> {
    const { results } = await this.lintFile(filePath);
    return results.flatMap((result) => result.messages.filter((message) => message.severity === 2));
  }

  /**
   * Get only warning messages
   * @param filePath - Path to the file to lint
   * @returns Array of warning messages
   */
  async getWarnings(filePath: string): Promise<ESLintLinter.LintMessage[]> {
    const { results } = await this.lintFile(filePath);
    return results.flatMap((result) => result.messages.filter((message) => message.severity === 1));
  }

  /**
   * Fix lint errors automatically
   * @param filePath - Path to the file to fix
   * @param dryRun - If true, returns the fixed content without writing to file
   * @returns Fixed content and remaining issues
   */
  async fixFile(
    filePath: string,
    dryRun = false
  ): Promise<{
    fixed: boolean;
    output?: string;
    results: ESLint.LintResult[];
    errors: ESLintLinter.LintMessage[];
    warnings: ESLintLinter.LintMessage[];
  }> {
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

    const eslint = new ESLint({ cwd: this.lintRoot, fix: true });
    const results = await eslint.lintFiles([filePath]);
    const errors = results.flatMap((result) => result.messages.filter((message) => message.severity === 2));
    const warnings = results.flatMap((result) => result.messages.filter((message) => message.severity === 1));
    if (!dryRun) await ESLint.outputFixes(results);

    const fixedResult = results[0];
    return { fixed: fixedResult.output !== undefined, output: fixedResult.output, results, errors, warnings };
  }

  /**
   * Get ESLint configuration for a file
   * @param filePath - Path to the file
   * @returns ESLint configuration object
   */
  async getConfigForFile(filePath: string): Promise<unknown> {
    const eslint = new ESLint();
    const config = (await eslint.calculateConfigForFile(filePath)) as unknown;
    return config;
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
