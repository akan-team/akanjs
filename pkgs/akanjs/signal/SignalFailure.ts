// Anything but an `Exception` is generalized: a stack names server paths and a driver message quotes the statement.
export class SignalFailure {
  static readonly message = "Internal Server Error";
  static #detailed: boolean | null = null;

  /** On only under `akan start`, a development or test NODE_ENV, or `AKAN_ERROR_DETAIL=1`; off when NODE_ENV is unset. */
  static get detailed(): boolean {
    const nodeEnv = process.env.NODE_ENV;
    SignalFailure.#detailed ??=
      process.env.AKAN_ERROR_DETAIL === "1" ||
      process.env.AKAN_COMMAND_TYPE === "start" ||
      nodeEnv === "development" ||
      nodeEnv === "test";
    return SignalFailure.#detailed;
  }

  static reset() {
    SignalFailure.#detailed = null;
  }

  static body<Extra extends Record<string, unknown> = Record<string, never>>(
    error: unknown,
    extra: Extra = {} as Extra,
  ): Extra & { error: string; statusCode: number; timestamp: string; stack?: string } {
    const detailed = SignalFailure.detailed;
    return {
      error: detailed ? (error instanceof Error ? error.message : String(error)) : SignalFailure.message,
      statusCode: 500,
      ...extra,
      timestamp: new Date().toISOString(),
      ...(detailed && error instanceof Error && error.stack ? { stack: error.stack } : {}),
    };
  }

  static response(error: unknown, extra: Record<string, unknown> = {}): Response {
    return new Response(JSON.stringify(SignalFailure.body(error, extra)), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
