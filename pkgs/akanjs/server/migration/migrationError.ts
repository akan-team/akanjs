export type MigrationErrorCode =
  | "usage"
  | "notFound"
  | "invalidParam"
  | "locked"
  | "alreadyApplied"
  | "notApplied"
  | "planChanged"
  | "verifyFailed"
  | "failed";

/** A refusal or failure whose `code` the JSON result carries, so a caller decides by it rather than by the message. */
export class MigrationError extends Error {
  readonly code: MigrationErrorCode;
  /** The ledger run the failure was recorded on, when it got that far. */
  runId: string | null = null;

  constructor(code: MigrationErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MigrationError";
    this.code = code;
  }

  static codeOf(error: unknown): MigrationErrorCode {
    return error instanceof MigrationError ? error.code : "failed";
  }

  static messageOf(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  /** What a verify that found `problemNum` problems reports. */
  static remaining(problemNum: number) {
    return problemNum === 1 ? "1 problem remains" : `${problemNum} problems remain`;
  }

  static recorded(error: unknown, runId: string) {
    const recorded =
      error instanceof MigrationError
        ? error
        : new MigrationError("failed", MigrationError.messageOf(error), { cause: error });
    recorded.runId = runId;
    return recorded;
  }
}
