import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";

export type BiomeSeverity = "error" | "warning" | "information" | "hint";

export interface BiomePosition {
  line: number;
  column: number;
}

export interface BiomeDiagnostic {
  severity: BiomeSeverity;
  message: string;
  category?: string;
  location?: {
    path?: string;
    start?: BiomePosition;
    end?: BiomePosition;
  };
}

export interface BiomeReport {
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

// Biome mixes config and IO diagnostics into the report stream, and that text can carry braces of its own, so every
// `{` is tried as a start (string literals skipped) and the first candidate that parses and carries a report field wins.
export const parseBiomeReport = (output: string): BiomeReport => {
  for (let start = output.indexOf("{"); start !== -1; start = output.indexOf("{", start + 1)) {
    const end = objectEndAt(output, start);
    if (end === -1) break;
    const report = asBiomeReport(output.slice(start, end + 1));
    if (report) return report;
  }
  throw new Error(output.trim() || "No Biome JSON output");
};

const objectEndAt = (output: string, start: number): number => {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let idx = start; idx < output.length; idx += 1) {
    const char = output[idx];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return idx;
  }
  return -1;
};

const asBiomeReport = (candidate: string): BiomeReport | null => {
  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    if (!("diagnostics" in parsed) && !("summary" in parsed)) return null;
    return parsed as BiomeReport;
  } catch {
    return null;
  }
};

/** Biome reads `biome.json` first and `biome.jsonc` second; only the latter may carry comments. */
const BIOME_CONFIG_FILES = ["biome.json", "biome.jsonc"] as const;

const emptyResult = (filePath: string): LintResult => ({
  filePath,
  messages: [],
  errorCount: 0,
  warningCount: 0,
  fixableErrorCount: 0,
  fixableWarningCount: 0,
});

export class Linter {
  //? The package's bin is npm's `#!/usr/bin/env node` wrapper, which picks the platform binary; run through the Bun
  //? running akan, it works in an image with no Node (exit 127 otherwise). A Biome on PATH is the fallback.
  static biomeCommand(root: string): [string, ...string[]] {
    const wrapper = path.join(root, "node_modules", "@biomejs", "biome", "bin", "biome");
    return existsSync(wrapper) ? [process.execPath, wrapper] : ["biome"];
  }

  lintRoot: string;
  configPath: string;
  #biomeCommand: [string, ...string[]];

  constructor(cwdPath: string) {
    this.lintRoot = this.#findBiomeRootPath(cwdPath);
    this.configPath = Linter.#configPathIn(this.lintRoot) ?? path.join(this.lintRoot, "biome.json");
    this.#biomeCommand = Linter.biomeCommand(this.lintRoot);
  }

  static #configPathIn(dir: string): string | null {
    for (const fileName of BIOME_CONFIG_FILES) {
      const configPath = path.join(dir, fileName);
      if (existsSync(configPath)) return configPath;
    }
    return null;
  }

  #findBiomeRootPath(dir: string): string {
    if (Linter.#configPathIn(dir)) return dir;
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
      const [command, ...prefixArgs] = this.#biomeCommand;
      const proc = spawn(command, [...prefixArgs, ...args], {
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
      const result = resultsByPath.get(diagnosticFilePath) ?? emptyResult(diagnosticFilePath);
      const message = this.#createLintMessage(diagnostic);
      result.messages.push(message);
      if (message.severity === 2) result.errorCount += 1;
      else result.warningCount += 1;
      resultsByPath.set(diagnosticFilePath, result);
    }

    return [
      resultsByPath.get(filePath) ?? emptyResult(filePath),
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
      this.configPath,
      this.#toBiomePath(filePath),
    ]);
    const report = parseBiomeReport(stdout || stderr);
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

  async lintFile(filePath: string): Promise<LintResponse> {
    const resolvedFilePath = this.#resolveFilePath(filePath);
    if (!existsSync(resolvedFilePath)) throw new Error(`File not found: ${filePath}`);
    return await this.#checkFile(resolvedFilePath);
  }

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
            //? An unreadable source only loses its code frame.
          }
        }

        result.messages.forEach((message) => {
          const type = message.severity === 2 ? "error" : "warning";
          const typeColor = message.severity === 2 ? chalk.red : chalk.yellow;
          const icon = message.severity === 2 ? "x" : "!";
          const ruleInfo = message.ruleId ? chalk.dim(` (${message.ruleId})`) : "";

          output.push(`\n  ${icon} ${typeColor(type)}: ${message.message}${ruleInfo}`);
          output.push(`     ${chalk.gray("at")} ${result.filePath}:${chalk.bold(`${message.line}:${message.column}`)}`);

          if (sourceLines.length > 0 && message.line <= sourceLines.length) {
            const sourceLine = sourceLines[message.line - 1];
            const lineNumber = message.line.toString().padStart(5, " ");

            output.push(`\n${chalk.dim(`${lineNumber} |`)} ${sourceLine}`);

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

  async getDetailedLintInfo(filePath: string) {
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
      { errorCount: 0, warningCount: 0, fixableErrorCount: 0, fixableWarningCount: 0 },
    );

    return { results, details, stats };
  }

  /** Also false when the file cannot be linted at all. */
  async hasNoLintErrors(filePath: string): Promise<boolean> {
    try {
      const { results } = await this.lintFile(filePath);
      return results.every((result) => result.errorCount === 0);
    } catch {
      return false;
    }
  }

  async getErrors(filePath: string): Promise<LintMessage[]> {
    const { results } = await this.lintFile(filePath);
    return results.flatMap((result) => result.messages.filter((message) => message.severity === 2));
  }

  async getWarnings(filePath: string): Promise<LintMessage[]> {
    const { results } = await this.lintFile(filePath);
    return results.flatMap((result) => result.messages.filter((message) => message.severity === 1));
  }

  /** `dryRun` returns the fixed content in `output` without writing the file. */
  async fixFile(filePath: string, dryRun = false): Promise<LintResponse> {
    const resolvedFilePath = this.#resolveFilePath(filePath);
    if (!existsSync(resolvedFilePath)) throw new Error(`File not found: ${filePath}`);

    if (!dryRun) return await this.#checkFile(resolvedFilePath, { write: true });

    const source = readFileSync(resolvedFilePath, "utf8");
    const { stdout } = await this.#runBiome(
      ["check", "--write", "--config-path", this.configPath, "--stdin-file-path", this.#toBiomePath(resolvedFilePath)],
      source,
    );
    const lintResult = await this.lintFile(resolvedFilePath);
    return { ...lintResult, fixed: stdout !== source, output: stdout };
  }

  // One spawn for all files: Biome's startup dominates a small file. Missing paths are dropped (a template may
  // decline a file).
  async fixFiles(filePaths: string[]): Promise<{ fixed: string[] }> {
    const resolved = filePaths.map((filePath) => this.#resolveFilePath(filePath)).filter(existsSync);
    if (resolved.length === 0) return { fixed: [] };
    const before = new Map(resolved.map((filePath) => [filePath, readFileSync(filePath, "utf8")]));
    await this.#runBiome([
      "check",
      "--write",
      "--reporter=json",
      "--max-diagnostics=none",
      "--no-errors-on-unmatched",
      "--config-path",
      this.configPath,
      ...resolved.map((filePath) => this.#toBiomePath(filePath)),
    ]);
    return {
      fixed: resolved.filter((filePath) => readFileSync(filePath, "utf8") !== before.get(filePath)),
    };
  }

  async getConfigForFile(filePath: string): Promise<unknown> {
    const resolvedFilePath = this.#resolveFilePath(filePath);
    if (!existsSync(resolvedFilePath)) throw new Error(`File not found: ${filePath}`);
    return JSON.parse(readFileSync(this.configPath, "utf8")) as unknown;
  }

  async getProblematicRules(filePath: string): Promise<Record<string, number>> {
    const { results } = await this.lintFile(filePath);
    const ruleCounts: Record<string, number> = {};
    for (const message of results.flatMap((result) => result.messages))
      if (message.ruleId) ruleCounts[message.ruleId] = (ruleCounts[message.ruleId] || 0) + 1;
    return ruleCounts;
  }
}
