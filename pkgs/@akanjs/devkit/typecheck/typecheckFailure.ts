import { CliError } from "../commandDecorators/cliError";
import type { TypecheckRecord } from "./typeChecker";

export class TypecheckFailure extends CliError<"checkFailed"> {
  //? The worker's exit when the project has type errors, so its crash, which exits 1, is told apart.
  static readonly workerExitCode = 3;

  constructor(readonly records: TypecheckRecord[]) {
    super(
      "checkFailed",
      records
        .slice(0, 20)
        .map((record) => `${record.file ?? "-"}:${record.line}:${record.col} ${record.code} ${record.message}`)
        .join("\n") || "Typecheck failed",
    );
    this.name = "TypecheckFailure";
  }
}
