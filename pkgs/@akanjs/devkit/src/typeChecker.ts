import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

import type { Executor } from "./executors";

export class TypeChecker {
  readonly configPath: string;
  readonly configFile: { config?: any; error?: ts.Diagnostic };
  readonly config: ts.ParsedCommandLine;
  constructor(executor: Executor) {
    const configPath = this.#findConfigFile(executor.cwdPath);
    if (!configPath) throw new Error("No tsconfig.json found in the project");
    this.configPath = configPath;
    this.configFile = ts.readConfigFile(this.configPath, (fileName) => ts.sys.readFile(fileName));
    const parsedConfig = ts.parseJsonConfigFileContent(
      this.configFile.config,
      ts.sys,
      path.dirname(this.configPath),
      undefined,
      this.configPath
    );

    if (parsedConfig.errors.length > 0) {
      const errorMessages = parsedConfig.errors
        .map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n"))
        .join("\n");
      throw new Error(`Error parsing tsconfig.json:\n${errorMessages}`);
    }
    this.config = parsedConfig;
  }
  /**
   * Find tsconfig.json by walking up the directory tree
   */
  #findConfigFile(searchPath: string): string | undefined {
    return ts.findConfigFile(searchPath, (fileName) => ts.sys.fileExists(fileName), "tsconfig.json");
  }

  /**
   * Type-check a single TypeScript file
   * @param filePath - Path to the TypeScript file to check
   * @returns Array of diagnostic messages
   */
  check(filePath: string): {
    diagnostics: ts.Diagnostic[];
    errors: ts.Diagnostic[];
    warnings: ts.Diagnostic[];
    fileDiagnostics: ts.Diagnostic[];
    fileErrors: ts.Diagnostic[];
    fileWarnings: ts.Diagnostic[];
  } {
    const program = ts.createProgram([filePath], this.config.options);
    const diagnostics = [
      ...program.getSemanticDiagnostics(),
      ...program.getSyntacticDiagnostics(),
      // Only check declaration diagnostics when declaration emit is enabled
      ...(this.config.options.declaration ? program.getDeclarationDiagnostics() : []),
    ];
    const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    const warnings = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Warning);
    const fileDiagnostics = diagnostics.filter((diagnostic) => diagnostic.file?.fileName === filePath);
    const fileErrors = fileDiagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    const fileWarnings = fileDiagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Warning);
    return { diagnostics, errors, warnings, fileDiagnostics, fileErrors, fileWarnings };
  }

  /**
   * Format diagnostics for console output
   * @param diagnostics - Array of TypeScript diagnostics
   * @returns Formatted string
   */
  formatDiagnostics(diagnostics: ts.Diagnostic[]): string {
    if (diagnostics.length === 0) return chalk.bold("✅ No type errors found");

    const output: string[] = [];
    let errorCount = 0;
    let warningCount = 0;
    let suggestionCount = 0;

    // Group diagnostics by file
    const diagnosticsByFile = new Map<string, ts.Diagnostic[]>();
    diagnostics.forEach((diagnostic) => {
      if (diagnostic.category === ts.DiagnosticCategory.Error) errorCount++;
      else if (diagnostic.category === ts.DiagnosticCategory.Warning) warningCount++;
      else if (diagnostic.category === ts.DiagnosticCategory.Suggestion) suggestionCount++;

      if (diagnostic.file) {
        const fileName = diagnostic.file.fileName;
        if (!diagnosticsByFile.has(fileName)) diagnosticsByFile.set(fileName, []);
        const fileDiagnostics = diagnosticsByFile.get(fileName);
        if (fileDiagnostics) fileDiagnostics.push(diagnostic);
      } else {
        if (!diagnosticsByFile.has("")) diagnosticsByFile.set("", []);
        const fileDiagnostics = diagnosticsByFile.get("");
        if (fileDiagnostics) fileDiagnostics.push(diagnostic);
      }
    });

    // Format diagnostics by file
    diagnosticsByFile.forEach((fileDiagnostics, fileName) => {
      if (fileName) output.push(`\n${chalk.cyan(fileName)}`);

      fileDiagnostics.forEach((diagnostic) => {
        const categoryText =
          diagnostic.category === ts.DiagnosticCategory.Error
            ? "error"
            : diagnostic.category === ts.DiagnosticCategory.Warning
              ? "warning"
              : "suggestion";
        const categoryColor =
          diagnostic.category === ts.DiagnosticCategory.Error
            ? chalk.red
            : diagnostic.category === ts.DiagnosticCategory.Warning
              ? chalk.yellow
              : chalk.blue;
        const icon =
          diagnostic.category === ts.DiagnosticCategory.Error
            ? "❌"
            : diagnostic.category === ts.DiagnosticCategory.Warning
              ? "⚠️"
              : "💡";
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
        const tsCode = chalk.dim(`(TS${diagnostic.code})`);

        if (diagnostic.file && diagnostic.start !== undefined) {
          const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);

          output.push(`\n  ${icon} ${categoryColor(categoryText)}: ${message} ${tsCode}`);
          output.push(`     ${chalk.gray("at")} ${fileName}:${chalk.bold(`${line + 1}:${character + 1}`)}`);

          // Show source line with underline
          const sourceLines = diagnostic.file.text.split("\n");
          if (line < sourceLines.length) {
            const sourceLine = sourceLines[line];
            const lineNumber = (line + 1).toString().padStart(5, " ");

            output.push(`\n${chalk.dim(lineNumber + " |")} ${sourceLine}`);

            // Create underline with squiggly for TypeScript
            const underlinePrefix = " ".repeat(character);
            const length = diagnostic.length ?? 1;
            const underline = "~".repeat(Math.max(1, length));

            output.push(
              `${chalk.dim(" ".repeat(lineNumber.length) + " |")} ${underlinePrefix}${categoryColor(underline)}`
            );
          }
        } else output.push(`\n  ${icon} ${categoryColor(categoryText)}: ${message} ${tsCode}`);
      });
    });

    const summary = [] as string[];
    if (errorCount > 0) summary.push(chalk.red(`${errorCount} error(s)`));
    if (warningCount > 0) summary.push(chalk.yellow(`${warningCount} warning(s)`));
    if (suggestionCount > 0) summary.push(chalk.blue(`${suggestionCount} suggestion(s)`));

    return `\n${summary.join(", ")} found` + output.join("\n");
  }

  /**
   * Get detailed diagnostic information with code snippet
   * @param filePath - Path to the TypeScript file to check
   * @returns Object containing diagnostics and detailed information
   */
  getDetailedDiagnostics(filePath: string): {
    diagnostics: ts.Diagnostic[];
    details: { line: number; column: number; message: string; code: number; codeSnippet?: string }[];
  } {
    const { diagnostics } = this.check(filePath);
    const sourceFile = ts.createSourceFile(filePath, fs.readFileSync(filePath, "utf8"), ts.ScriptTarget.Latest, true);

    const details = diagnostics.map((diagnostic) => {
      if (diagnostic.file && diagnostic.start !== undefined) {
        const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");

        const lines = sourceFile.text.split("\n");
        const codeSnippet = line < lines.length ? lines[line] : undefined;
        return { line: line + 1, column: character + 1, message, code: diagnostic.code, codeSnippet };
      }

      return {
        line: 0,
        column: 0,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        code: diagnostic.code,
      };
    });

    return { diagnostics, details };
  }

  /**
   * Check if a file has type errors
   * @param filePath - Path to the TypeScript file to check
   * @returns true if there are no type errors, false otherwise
   */
  hasNoTypeErrors(filePath: string): boolean {
    try {
      const { diagnostics } = this.check(filePath);
      return diagnostics.length === 0;
    } catch (error) {
      return false;
    }
  }
}
