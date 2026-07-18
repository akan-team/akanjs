import type { PrimitiveFormat, PrimitiveWriteReport } from "./types";
import { jsonText } from "./utils";

export const createPrimitiveWriteReport = ({
  command,
  status,
  changedFiles = [],
  generatedFiles = [],
  validationCommands = [],
  diagnostics = [],
  nextActions = [],
}: Omit<PrimitiveWriteReport, "schemaVersion" | "status"> & {
  status?: PrimitiveWriteReport["status"];
}): PrimitiveWriteReport => ({
  schemaVersion: 1,
  command,
  status: status ?? (diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "failed" : "passed"),
  changedFiles,
  generatedFiles,
  validationCommands,
  diagnostics,
  nextActions,
});

export const renderPrimitiveWriteReport = (report: PrimitiveWriteReport) =>
  [
    `# Primitive Write: ${report.command}`,
    "",
    `- Status: ${report.status}`,
    "",
    "## Changed Files",
    ...(report.changedFiles.length
      ? report.changedFiles.map((file) => `- \`${file.action}\` ${file.path}: ${file.reason}`)
      : ["- none"]),
    "",
    "## Generated Files",
    ...(report.generatedFiles.length
      ? report.generatedFiles.map((file) => `- \`${file.action}\` ${file.path}: ${file.reason}`)
      : ["- none"]),
    "",
    "## Validation Commands",
    ...(report.validationCommands.length
      ? report.validationCommands.map((validation) => `- \`${validation.command}\`: ${validation.reason}`)
      : ["- none"]),
    "",
    "## Diagnostics",
    ...(report.diagnostics.length
      ? report.diagnostics.map((diagnostic) => `- [${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`)
      : ["- none"]),
    "",
    "## Next Actions",
    ...(report.nextActions.length
      ? report.nextActions.map((action) => `- \`${action.command}\`: ${action.reason}`)
      : ["- none"]),
    "",
  ].join("\n");

export const renderPrimitiveReport = (report: PrimitiveWriteReport, format: PrimitiveFormat = "markdown") =>
  format === "json" ? jsonText(report) : renderPrimitiveWriteReport(report);
