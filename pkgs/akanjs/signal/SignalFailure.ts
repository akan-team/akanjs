import { AkanError } from "akanjs/base";

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

  static generalized(error: unknown): { error: string; statusCode: number; code?: string } {
    if (!AkanError.is(error)) return { error: SignalFailure.message, statusCode: 500 };
    const statusCode = error.statusCode >= 400 && error.statusCode <= 599 ? error.statusCode : 500;
    return { error: AkanError.reasonOf(statusCode), statusCode, code: error.code };
  }

  static body<Extra extends Record<string, unknown> = Record<string, never>>(
    error: unknown,
    extra: Extra = {} as Extra,
  ): Extra & { error: string; statusCode: number; code?: string; timestamp: string; stack?: string } {
    const detailed = SignalFailure.detailed;
    const generalized = SignalFailure.generalized(error);
    return {
      ...generalized,
      ...(detailed ? { error: error instanceof Error ? error.message : String(error) } : {}),
      ...extra,
      timestamp: new Date().toISOString(),
      ...(detailed && error instanceof Error && error.stack ? { stack: error.stack } : {}),
    };
  }

  static response(error: unknown, extra: Record<string, unknown> = {}): Response {
    const body = SignalFailure.body(error, extra);
    return new Response(JSON.stringify(body), {
      status: body.statusCode,
      headers: SignalFailure.headersOf(error, body.statusCode),
    });
  }

  //? A 429 names its wait in `data.seconds`, as `EndpointRateLimit` throws it. A generalized body leaves `data` out,
  //? so the header is the only place a caller reads it.
  static headersOf(error: unknown, statusCode: number): Record<string, string> {
    const seconds = (error as { data?: { seconds?: unknown } } | null)?.data?.seconds;
    if (statusCode !== 429 || typeof seconds !== "number" || !Number.isFinite(seconds))
      return { "Content-Type": "application/json" };
    return { "Content-Type": "application/json", "Retry-After": String(Math.max(1, Math.ceil(seconds))) };
  }
}
