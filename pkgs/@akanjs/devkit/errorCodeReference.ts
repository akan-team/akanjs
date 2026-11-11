import path from "node:path";
import { type ErrorCodeRow, ErrorCodeScan } from "./errorCodeScan";

export class ErrorCodeReference {
  static readonly guideline = "errorCodes";

  static target(cliDir: string) {
    return path.join(
      cliDir,
      "guidelines",
      ErrorCodeReference.guideline,
      `${ErrorCodeReference.guideline}.instruction.md`,
    );
  }

  static collect(akanjsDir: string): ErrorCodeRow[] {
    return new ErrorCodeScan(akanjsDir).rows();
  }

  static render(akanjsDir: string): string {
    const scan = new ErrorCodeScan(akanjsDir);
    const rows = scan.rows();
    const yesNo = (value: boolean) => (value ? "yes" : "no");
    return [
      "# Akan.js error codes",
      "",
      "Generated from the akanjs sources of this release: every code a framework error carries, so a caller branches on",
      "`error.code`, or the `code` of the JSON it was answered with, rather than on the message.",
      "",
      "- A **forwarded** error answers with its own JSON. Any other `AkanError` answers with its code and status, and in",
      "  production with the status's reason in place of its message, which can name a table, a file or what a provider",
      "  said (`akan start` and `AKAN_ERROR_DETAIL=1` keep the message).",
      "- **Code on the wire** says whether that JSON carries `code`. A forwarded error whose JSON leaves it out is told",
      "  apart by its `error` key and status.",
      "- An app's own failure is a dictionary `Err`, which carries its key in `error` instead of one of these codes.",
      '- In code, `AkanError.is(error, "<code>")` tests any framework error for a code, and `<Class>.is(error)` one class.',
      "",
      "## Codes",
      "",
      "| Code | Status | Error | Forwarded | Code on the wire | Source |",
      "|---|---|---|---|---|---|",
      ...rows.map(
        (row) =>
          `| ${ErrorCodeReference.#codeCell(row)} | ${row.statusCode ?? "set when thrown"} | \`${row.error}\` | ${yesNo(row.forwarded)} | ${yesNo(row.wire)} | \`${row.file}\` |`,
      ),
      "",
      "## Codes by status",
      "",
      "An error coded by its status, such as an `Exception`, takes its code from `AkanError.codeOfStatus`:",
      "",
      "| Status | Code | Reason |",
      "|---|---|---|",
      ...[...scan.statuses].map(([status, [code, reason]]) => `| ${status} | \`${code}\` | ${reason} |`),
      "",
      "Any other status is coded `http<status>`, with the reason `Internal Server Error` from 500 and `Request Failed`",
      "below it.",
      "",
    ].join("\n");
  }

  static #codeCell(row: ErrorCodeRow) {
    if (row.code !== null) return `\`${row.code}\``;
    return row.byStatus ? "by status" : "set when thrown";
  }
}

if (import.meta.main) {
  const akanjsDir = path.resolve(import.meta.dir, "../../akanjs");
  const target = ErrorCodeReference.target(path.resolve(import.meta.dir, "../cli"));
  await Bun.write(target, ErrorCodeReference.render(akanjsDir));
}
