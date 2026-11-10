import { CliError } from "./cliError";

//* A failure that is an answer, not a breakage: the CLI exits with its code, so a CI tells the two apart.
export class ExitCodeError extends CliError {
  override readonly name = "ExitCodeError";

  constructor(message: string, exitCode: number) {
    super(exitCode === 2 ? "refused" : exitCode === 3 ? "checkFailed" : "failed", message, { exitCode });
  }

  static codeOf(error: unknown): number | null {
    return CliError.exitCodeOf(error);
  }
}
