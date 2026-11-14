import { AkanError } from "akanjs/base";
import { FailureCode, isGuardRefusal, type LogAttrs } from "akanjs/common";
import { isExceptionLike } from "./exception";

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

  static statusOf(error: unknown): number {
    return isExceptionLike(error) ? error.statusCode : SignalFailure.generalized(error).statusCode;
  }

  static logAttrs(error: unknown): LogAttrs {
    if (!(error instanceof Error)) return { type: typeof error };
    return {
      type: error.name !== "Error" ? error.name : error.constructor.name,
      ...(AkanError.is(error) ? { code: error.code } : {}),
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }

  static generalized(error: unknown): { error: string; statusCode: number; code?: string } {
    if (!AkanError.is(error)) return { error: SignalFailure.message, statusCode: 500 };
    const statusCode = error.statusCode >= 400 && error.statusCode <= 599 ? error.statusCode : 500;
    return { error: AkanError.reasonOf(statusCode), statusCode, code: error.code };
  }

  //? Named as its HTTP body names it, by the rule use-agentic's `codeOfAnswer` reads that body with before a turn's
  //? stream opens; keep the two in step. Security: a 401/403 takes no key, as a refusal's key names the authorization
  //? structure; a guard's is named by its status alone. A 5xx keeps its body's bounded, prose-free code, which HTTP
  //? already sends and a third-party error's `toJSON()` may have written; MCP still redacts its text.
  static codeOf(error: unknown, status: number | undefined): string {
    if (!status) return AkanError.codeOfStatus(500);
    const byStatus = AkanError.codeOfStatus(status);
    if (isGuardRefusal(error)) return byStatus;
    const wire = SignalFailure.#wireOf(error);
    const kept = FailureCode.isToken(wire.code) ? wire.code : undefined;
    if (status === 401 || status === 403) return kept ?? byStatus;
    return [wire.error, wire.message, wire.code].find(FailureCode.isKey) ?? kept ?? byStatus;
  }

  //? The body HTTP answers with, less the raw message detailed mode puts in a generalized one. Read while a failure is
  //? already being answered: a `toJSON()` that throws, or gives no plain object, names it by its status instead.
  static #wireOf(error: unknown): { error?: unknown; message?: unknown; code?: unknown } {
    if (!isExceptionLike(error)) return AkanError.is(error) ? { code: error.code } : {};
    try {
      const wire: unknown = error.toJSON();
      return typeof wire === "object" && wire !== null && !Array.isArray(wire) ? wire : {};
    } catch {
      return {};
    }
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
