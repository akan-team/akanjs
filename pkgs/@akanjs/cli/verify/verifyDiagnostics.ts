import type { BiomeReport } from "@akanjs/devkit/linter";
import type { MaintainabilityReport } from "@akanjs/devkit/maintainabilityReport";
import type { QualityWarning } from "@akanjs/devkit/qualityScanner";
import type { TypecheckRecord } from "@akanjs/devkit/typeChecker";

export type VerifyStepName = "sync" | "lint" | "typecheck" | "build" | "ssr";

export interface VerifyDiagnostic {
  step: VerifyStepName;
  file: string | null;
  line: number;
  col: number;
  code: string;
  severity: "error" | "warning";
  message: string;
  fix?: string;
}

type MaintainabilityEntry = ReturnType<typeof MaintainabilityReport.entriesOf>[number];

export class VerifyDiagnostics {
  static fromTypecheck(records: TypecheckRecord[]): VerifyDiagnostic[] {
    return records.map((record) => ({
      step: "typecheck",
      file: record.file,
      line: record.line,
      col: record.col,
      code: record.code,
      severity: record.severity,
      //? A TS message chain repeats the head in each elaboration; the first line is the one a fix starts from.
      message: record.message.split("\n")[0] ?? record.message,
    }));
  }

  static fromBiome(report: BiomeReport): VerifyDiagnostic[] {
    return (report.diagnostics ?? [])
      .filter((diagnostic) => diagnostic.severity === "error" || diagnostic.severity === "warning")
      .map((diagnostic) => ({
        step: "lint",
        file: diagnostic.location?.path?.replaceAll("\\", "/") ?? null,
        line: diagnostic.location?.start?.line ?? 0,
        col: diagnostic.location?.start?.column ?? 0,
        code: diagnostic.category ?? "biome",
        severity: diagnostic.severity === "error" ? "error" : "warning",
        message: diagnostic.message,
      }));
  }

  static fromMaintainability(entries: MaintainabilityEntry[]): VerifyDiagnostic[] {
    return entries.map((entry) => ({
      step: "lint",
      file: entry.file,
      line: entry.line,
      col: 0,
      code: entry.rule,
      severity: "error",
      message: entry.problem,
      fix: entry.path ? `${entry.fix} Path: ${entry.path}` : entry.fix,
    }));
  }

  static fromQuality(warnings: QualityWarning[], changedFiles: ReadonlySet<string>): VerifyDiagnostic[] {
    return warnings
      .filter((warning) => warning.file && changedFiles.has(warning.file))
      .map((warning) => ({
        step: "ssr",
        file: warning.file ?? null,
        line: warning.line ?? 0,
        col: 0,
        code: warning.rule,
        severity: "warning",
        message: warning.message,
        ...(warning.fix ? { fix: warning.fix } : {}),
      }));
  }

  static readonly #prefix = /^\[([\w.-]+)\]\s*/;
  static readonly #location = /((?:apps|libs|pkgs)\/[^\s:()`'"]+\.[a-z]+)(?::(\d+)(?::(\d+))?)?/;

  static fromMessage(step: VerifyStepName, message: string, code = `akan.${step}`): VerifyDiagnostic {
    const prefix: RegExpExecArray | null = VerifyDiagnostics.#prefix.exec(message);
    const location: RegExpExecArray | null = VerifyDiagnostics.#location.exec(message);
    return {
      step,
      file: location ? (location[1] ?? null) : null,
      line: Number(location?.[2] ?? 0),
      col: Number(location?.[3] ?? 0),
      code: prefix?.[1] ?? code,
      severity: "error",
      message: message.slice(prefix?.[0].length ?? 0).trim(),
    };
  }
}
