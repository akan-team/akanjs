import { AkanError } from "akanjs/base";

export type CliErrorCode = "failed" | "usage" | "unknownTarget" | "refused" | "checkFailed" | "interrupted";

export interface CliErrorOptions {
  exitCode?: number;
  cause?: unknown;
}

export interface CliFailure {
  ok: false;
  error: string;
  code: string;
}

//* The exit status is what a script branches on, and `code` says the same in a `--json` failure: 2 means fix the
//* command line or the target it names, 3 that a check ran and found problems, 1 that the command itself broke.
export class CliError<Code extends string = CliErrorCode> extends AkanError<Code> {
  static readonly exitCodes: { readonly [code in CliErrorCode]: number } = {
    failed: 1,
    usage: 2,
    unknownTarget: 2,
    refused: 2,
    checkFailed: 3,
    interrupted: 130,
  };
  static readonly usageCodes: readonly string[] = ["usage", "unknownTarget"];

  readonly exitCode: number;

  constructor(code: Code, message: string, { exitCode, cause }: CliErrorOptions = {}) {
    super(code, message, { cause });
    this.exitCode = exitCode ?? CliError.#exitCodeOfCode(code) ?? 1;
  }

  static failureCodeOf(error: unknown): string {
    if (AkanError.is(error)) return error.code;
    return CliError.#isPromptExit(error) ? "interrupted" : "failed";
  }

  static exitCodeOf(error: unknown): number | null {
    if (error instanceof CliError) return error.exitCode;
    const code = CliError.failureCodeOf(error);
    return code === "failed" ? null : CliError.#exitCodeOfCode(code);
  }

  static messageOf(error: unknown): string {
    if (error instanceof Error) return error.message || error.name;
    if (typeof error === "string") return error.trim() || "Unknown error";
    if (error === null || error === undefined) return "Unknown error";
    try {
      const json = JSON.stringify(error);
      if (json) return json;
    } catch {
      return String(error);
    }
    return String(error) || "Unknown error";
  }

  static failureOf(error: unknown): CliFailure {
    return { ok: false, error: CliError.messageOf(error), code: CliError.failureCodeOf(error) };
  }

  static #exitCodeOfCode(code: string): number | null {
    return Object.hasOwn(CliError.exitCodes, code) ? CliError.exitCodes[code as CliErrorCode] : null;
  }

  //? By name: @inquirer/prompts loads on the first prompt, so its ExitPromptError class is not here to compare with.
  static #isPromptExit(error: unknown) {
    return error instanceof Error && error.name === "ExitPromptError";
  }
}
