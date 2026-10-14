//* A failure that is an answer, not a breakage: the CLI exits with its code, so a CI tells the two apart.
export class ExitCodeError extends Error {
  override readonly name = "ExitCodeError";

  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
  }

  static codeOf(error: unknown): number | null {
    return error instanceof ExitCodeError ? error.exitCode : null;
  }
}
