import type { VerifyDiagnostic, VerifyStepName } from "./verifyDiagnostics";

export interface VerifyStepResult {
  name: VerifyStepName;
  status: "pass" | "fail" | "skip";
  ms: number;
  /** Files the step rewrote on disk (lint fixes); a caller holding an older copy must re-read them. */
  fixed: number;
}

export interface VerifyResult {
  ok: boolean;
  targets: string[];
  ms: number;
  steps: VerifyStepResult[];
  diagnostics: VerifyDiagnostic[];
}

//* An agent pays for every line on each later turn: no progress, colour or code frame, one capped line per diagnostic.
export class VerifyReport {
  static readonly lineMax = 280;
  static readonly defaultMax = 20;

  static text(result: VerifyResult, { max = VerifyReport.defaultMax }: { max?: number } = {}) {
    if (!result.targets.length) return "verify ok · nothing changed under apps/, libs/ or pkgs/";
    const lines = [VerifyReport.#header(result), ...VerifyReport.#diagnosticLines(result.diagnostics, max)];
    return lines.join("\n");
  }

  static json(result: VerifyResult) {
    return JSON.stringify(result);
  }

  static #header(result: VerifyResult) {
    const ran = result.steps.filter((step) => step.name !== "sync" || step.status === "fail");
    const fixed = result.steps.reduce((sum, step) => sum + step.fixed, 0);
    const seconds = `${(result.ms / 1000).toFixed(1)}s`;
    const fixedNote = fixed ? `fixed ${fixed} file${fixed === 1 ? "" : "s"}` : null;
    const steps = result.ok
      ? ran
          .filter((step) => step.status === "pass")
          .map((step) => step.name)
          .join(" ")
      : ran.map((step) => VerifyReport.#stepLabel(step, result.diagnostics)).join(" · ");
    return [`verify ${result.ok ? "ok" : "fail"}`, result.targets.join(", "), steps, fixedNote, seconds]
      .filter(Boolean)
      .join(" · ");
  }

  static #stepLabel(step: VerifyStepResult, diagnostics: VerifyDiagnostic[]) {
    if (step.status === "skip") return `${step.name} skipped`;
    if (step.status === "pass") return `${step.name} ok`;
    const errors = diagnostics.filter((entry) => entry.step === step.name && entry.severity === "error").length;
    return `${step.name} ${errors} error${errors === 1 ? "" : "s"}`;
  }

  static #diagnosticLines(diagnostics: VerifyDiagnostic[], max: number) {
    const groups = new Map<string, VerifyDiagnostic[]>();
    const ordered = [...diagnostics].sort(
      (a, b) => Number(a.severity === "warning") - Number(b.severity === "warning"),
    );
    for (const diagnostic of ordered) {
      const key = `${diagnostic.code}\0${diagnostic.message}`;
      groups.set(key, [...(groups.get(key) ?? []), diagnostic]);
    }
    const lines = [...groups.values()].map((group) => VerifyReport.#lineOf(group));
    if (max <= 0 || lines.length <= max) return lines;
    return [...lines.slice(0, max), `+${lines.length - max} more · akan verify --max 0`];
  }

  static #lineOf([first, ...rest]: VerifyDiagnostic[]) {
    if (!first) return "";
    const where = first.file
      ? `${first.file}${first.line ? `:${first.line}${first.col ? `:${first.col}` : ""}` : ""}`
      : "-";
    const others = rest.length
      ? ` (×${rest.length + 1}: ${rest
          .slice(0, 2)
          .map((entry) => (entry.file === first.file ? `:${entry.line}` : (entry.file ?? "-")))
          .join(", ")}${rest.length > 2 ? `, +${rest.length - 2}` : ""})`
      : "";
    const fix = first.fix ? ` fix: ${first.fix}` : "";
    const warning = first.severity === "warning" ? " warning" : "";
    const line = `${where}${others}${warning} ${first.code} ${first.message}${fix}`.replace(/\s+/g, " ").trim();
    return line.length <= VerifyReport.lineMax ? line : `${line.slice(0, VerifyReport.lineMax - 1)}…`;
  }
}
