import * as path from "node:path";
import * as ts from "typescript";
import { WithheldEnvFile } from "../lint/withheldEnvFile";

//? A TypeScript message quotes the literal too: `Type '"abc"' is not assignable`.
export class WithheldDiagnostics {
  static readonly note = WithheldEnvFile.note;

  static isWithheld(fileName: string | undefined) {
    return WithheldEnvFile.isEnvFile(fileName);
  }

  static applies(diagnostic: ts.Diagnostic) {
    return WithheldDiagnostics.isWithheld(diagnostic.file?.fileName);
  }

  static message(diagnostic: ts.Diagnostic) {
    return WithheldDiagnostics.applies(diagnostic)
      ? WithheldDiagnostics.note
      : ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  }

  static format(diagnostic: ts.Diagnostic, host: ts.FormatDiagnosticsHost) {
    const related = diagnostic.relatedInformation?.filter(
      ({ file }) => !WithheldDiagnostics.isWithheld(file?.fileName),
    );
    if (!WithheldDiagnostics.applies(diagnostic))
      return ts.formatDiagnosticsWithColorAndContext(
        [
          related?.length === diagnostic.relatedInformation?.length
            ? diagnostic
            : { ...diagnostic, relatedInformation: related },
        ],
        host,
      );
    const { file, start } = diagnostic;
    const at = file && start !== undefined ? file.getLineAndCharacterOfPosition(start) : { line: -1, character: -1 };
    const name = path.relative(host.getCurrentDirectory(), file?.fileName ?? "");
    return `${name}:${at.line + 1}:${at.character + 1} - error TS${diagnostic.code}: ${WithheldDiagnostics.note}${host.getNewLine()}`;
  }
}
