import { AsyncLocalStorage } from "node:async_hooks";
import { AkanError } from "akanjs/base";
import { Logger } from "akanjs/common";

export type ErrorReportSource = "server" | "render" | "process";

export interface ErrorReportContext {
  source: ErrorReportSource;
  /** The request id `x-request-id` names. */
  traceId: string | null;
  /** `<type>:<key>` of the endpoint that answered 5xx. */
  endpoint: string | null;
  /** The route pattern, such as `/:lang/orders/:orderId`, never the URL with its values. */
  routeId: string | null;
  accountId: string | null;
  /** The id a production render error shows the browser, also on the server log line. */
  digest: string | null;
}

export type ErrorReportInput = Pick<ErrorReportContext, "source"> & Partial<Omit<ErrorReportContext, "source">>;

export type ErrorReporter = (error: Error, context: ErrorReportContext) => void | Promise<void>;

export class ErrorReporting {
  static readonly flushTimeoutMs = 2_000;
  static #reporter: ErrorReporter | null = null;
  static #failureLogged = false;
  static readonly #reported = new WeakSet<object>();
  static readonly #pending = new Set<Promise<void>>();
  //? Bun runs a process error handler in the async context that raised it, so a reporter's own rejection is known here.
  static readonly #inReporter = new AsyncLocalStorage<true>();
  static readonly #logger = new Logger("ErrorReporter");

  static use(reporter: ErrorReporter | null) {
    ErrorReporting.#reporter = reporter;
    ErrorReporting.#failureLogged = false;
  }

  static get enabled(): boolean {
    return ErrorReporting.#reporter !== null;
  }

  static report(error: unknown, input: ErrorReportInput): void {
    const reporter = ErrorReporting.#reporter;
    if (!reporter || ErrorReporting.#inReporter.getStore()) return;
    if (typeof error === "object" && error !== null) {
      if (ErrorReporting.#reported.has(error)) return;
      ErrorReporting.#reported.add(error);
    }
    const reported =
      error instanceof Error
        ? error
        : new AkanError("nonErrorThrown", ErrorReporting.#describe(error), { cause: error });
    const context: ErrorReportContext = {
      source: input.source,
      traceId: input.traceId ?? null,
      endpoint: input.endpoint ?? null,
      routeId: input.routeId ?? null,
      accountId: input.accountId ?? null,
      digest: input.digest ?? null,
    };
    setImmediate(() => ErrorReporting.#call(reporter, reported, context));
  }

  static async flush(timeoutMs = ErrorReporting.flushTimeoutMs): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
    if (!ErrorReporting.#pending.size) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled([...ErrorReporting.#pending]),
      new Promise((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
    clearTimeout(timer);
  }

  static #call(reporter: ErrorReporter, error: Error, context: ErrorReportContext) {
    try {
      const result = ErrorReporting.#inReporter.run(true, () => reporter(error, context));
      if (typeof (result as PromiseLike<void> | undefined)?.then !== "function") return;
      const pending = Promise.resolve(result).then(
        () => undefined,
        (failure: unknown) => ErrorReporting.#failed(failure),
      );
      ErrorReporting.#pending.add(pending);
      void pending.finally(() => ErrorReporting.#pending.delete(pending));
    } catch (failure) {
      ErrorReporting.#failed(failure);
    }
  }

  static #failed(failure: unknown) {
    if (ErrorReporting.#failureLogged) return;
    ErrorReporting.#failureLogged = true;
    ErrorReporting.#logger.warn(
      `The error reporter failed, and later failures are not logged: ${failure instanceof Error ? failure.message : ErrorReporting.#describe(failure)}`,
    );
  }

  static #describe(value: unknown): string {
    try {
      return String(value).slice(0, 1_000);
    } catch {
      return typeof value;
    }
  }
}
