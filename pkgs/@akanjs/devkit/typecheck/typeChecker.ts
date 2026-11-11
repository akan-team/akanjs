import { readFileSync } from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import * as ts from "typescript";

import type { Executor } from "../executors";

export interface ProjectTypecheckResult {
  configPath: string;
  diagnostics: ts.Diagnostic[];
  errors: ts.Diagnostic[];
  warnings: ts.Diagnostic[];
  message: string;
}

export interface TypecheckRecord {
  /** Relative to the workspace root, `/`-separated; `null` for a diagnostic tied to no file. */
  file: string | null;
  line: number;
  col: number;
  code: string;
  severity: "error" | "warning";
  message: string;
}

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
      this.configPath,
    );

    if (parsedConfig.errors.length > 0) {
      const errorMessages = parsedConfig.errors
        .map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n"))
        .join("\n");
      throw new Error(`Error parsing tsconfig.json:\n${errorMessages}`);
    }
    this.config = parsedConfig;
  }
  #findConfigFile(searchPath: string): string | undefined {
    return ts.findConfigFile(searchPath, (fileName) => ts.sys.fileExists(fileName), "tsconfig.json");
  }

  check(filePath: string) {
    const program = ts.createProgram([filePath], this.config.options);
    const diagnostics = [
      ...program.getSemanticDiagnostics(),
      ...program.getSyntacticDiagnostics(),
      ...(this.config.options.declaration ? program.getDeclarationDiagnostics() : []),
    ];
    const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    const warnings = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Warning);
    const fileDiagnostics = diagnostics.filter((diagnostic) => diagnostic.file?.fileName === filePath);
    const fileErrors = fileDiagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    const fileWarnings = fileDiagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Warning);
    return { diagnostics, errors, warnings, fileDiagnostics, fileErrors, fileWarnings };
  }

  formatDiagnostics(diagnostics: ts.Diagnostic[]): string {
    if (diagnostics.length === 0) return chalk.bold("✅ No type errors found");

    const output: string[] = [];
    let errorCount = 0;
    let warningCount = 0;
    let suggestionCount = 0;

    const diagnosticsByFile = new Map<string, ts.Diagnostic[]>();
    diagnostics.forEach((diagnostic) => {
      if (diagnostic.category === ts.DiagnosticCategory.Error) errorCount++;
      else if (diagnostic.category === ts.DiagnosticCategory.Warning) warningCount++;
      else if (diagnostic.category === ts.DiagnosticCategory.Suggestion) suggestionCount++;
      diagnosticsByFile.getOrInsert(diagnostic.file?.fileName ?? "", []).push(diagnostic);
    });

    diagnosticsByFile.forEach((fileDiagnostics, fileName) => {
      if (fileName) output.push(`\n${chalk.cyan(fileName)}`);

      fileDiagnostics.forEach((diagnostic) => {
        const [categoryText, categoryColor, icon] =
          diagnostic.category === ts.DiagnosticCategory.Error
            ? (["error", chalk.red, "❌"] as const)
            : diagnostic.category === ts.DiagnosticCategory.Warning
              ? (["warning", chalk.yellow, "⚠️"] as const)
              : (["suggestion", chalk.blue, "💡"] as const);
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
        const tsCode = chalk.dim(`(TS${diagnostic.code})`);

        if (diagnostic.file && diagnostic.start !== undefined) {
          const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);

          output.push(`\n  ${icon} ${categoryColor(categoryText)}: ${message} ${tsCode}`);
          output.push(`     ${chalk.gray("at")} ${fileName}:${chalk.bold(`${line + 1}:${character + 1}`)}`);

          const sourceLines = diagnostic.file.text.split("\n");
          if (line < sourceLines.length) {
            const sourceLine = sourceLines[line];
            const lineNumber = (line + 1).toString().padStart(5, " ");

            output.push(`\n${chalk.dim(`${lineNumber} |`)} ${sourceLine}`);

            const underlinePrefix = " ".repeat(character);
            const length = diagnostic.length ?? 1;
            const underline = "~".repeat(Math.max(1, length));

            output.push(
              `${chalk.dim(`${" ".repeat(lineNumber.length)} |`)} ${underlinePrefix}${categoryColor(underline)}`,
            );
          }
        } else output.push(`\n  ${icon} ${categoryColor(categoryText)}: ${message} ${tsCode}`);
      });
    });

    const summary = [] as string[];
    if (errorCount > 0) summary.push(chalk.red(`${errorCount} error(s)`));
    if (warningCount > 0) summary.push(chalk.yellow(`${warningCount} warning(s)`));
    if (suggestionCount > 0) summary.push(chalk.blue(`${suggestionCount} suggestion(s)`));

    return `\n${summary.join(", ")} found${output.join("\n")}`;
  }

  getDetailedDiagnostics(filePath: string): {
    diagnostics: ts.Diagnostic[];
    details: { line: number; column: number; message: string; code: number; codeSnippet?: string }[];
  } {
    const { diagnostics } = this.check(filePath);
    const sourceFile = ts.createSourceFile(filePath, readFileSync(filePath, "utf8"), ts.ScriptTarget.Latest, true);

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

  /** Also false when the check itself throws. */
  hasNoTypeErrors(filePath: string): boolean {
    try {
      const { diagnostics } = this.check(filePath);
      return diagnostics.length === 0;
    } catch (_error) {
      return false;
    }
  }

  static checkProject(configPath: string): ProjectTypecheckResult {
    const parsedConfig = TypeChecker.parseConfig(configPath);
    const host = ts.createIncrementalCompilerHost(parsedConfig.options);
    const builderProgram = ts.createIncrementalProgram({
      rootNames: parsedConfig.fileNames,
      options: parsedConfig.options,
      projectReferences: parsedConfig.projectReferences,
      configFileParsingDiagnostics: parsedConfig.errors,
      host,
    });
    const diagnostics = [...TypeChecker.#preEmitDiagnostics(builderProgram), ...builderProgram.emit().diagnostics];
    const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    const warnings = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Warning);
    return {
      configPath,
      diagnostics,
      errors,
      warnings,
      message: TypeChecker.formatDiagnosticMessages(diagnostics),
    };
  }

  //* getPreEmitDiagnostics on the Program re-checks every file; the builder answers unchanged ones from .tsbuildinfo.
  static #preEmitDiagnostics(builderProgram: ts.BuilderProgram) {
    const { declaration, composite } = builderProgram.getCompilerOptions();
    return ts.sortAndDeduplicateDiagnostics([
      ...builderProgram.getConfigFileParsingDiagnostics(),
      ...builderProgram.getOptionsDiagnostics(),
      ...builderProgram.getSyntacticDiagnostics(),
      ...builderProgram.getGlobalDiagnostics(),
      ...builderProgram.getSemanticDiagnostics(),
      ...(declaration || composite ? builderProgram.getDeclarationDiagnostics() : []),
    ]);
  }

  static parseConfig(configPath: string): ts.ParsedCommandLine {
    const configFile = ts.readConfigFile(configPath, (fileName) => ts.sys.readFile(fileName));
    const configDiagnostics = configFile.error ? [configFile.error] : [];
    if (!configFile.config) {
      const message = TypeChecker.formatDiagnosticMessages(configDiagnostics);
      throw new Error(message || `Error reading tsconfig.json: ${configPath}`);
    }
    const parsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath),
      undefined,
      configPath,
    );
    if (parsedConfig.errors.length > 0) throw new Error(TypeChecker.formatDiagnosticMessages(parsedConfig.errors));
    return parsedConfig;
  }

  static toRecords(diagnostics: ts.Diagnostic[], root: string): TypecheckRecord[] {
    return diagnostics
      .filter(
        (diagnostic) =>
          diagnostic.category === ts.DiagnosticCategory.Error || diagnostic.category === ts.DiagnosticCategory.Warning,
      )
      .map((diagnostic) => {
        const position =
          diagnostic.file && diagnostic.start !== undefined
            ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
            : null;
        return {
          file: diagnostic.file ? path.relative(root, diagnostic.file.fileName).split(path.sep).join("/") : null,
          line: position ? position.line + 1 : 0,
          col: position ? position.character + 1 : 0,
          code: `TS${diagnostic.code}`,
          severity: diagnostic.category === ts.DiagnosticCategory.Error ? "error" : "warning",
          message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        };
      });
  }

  static formatDiagnosticMessages(diagnostics: ts.Diagnostic[]): string {
    return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => ts.sys.newLine,
    });
  }
}
