import { AsyncLocalStorage } from "node:async_hooks";
import { AkanError } from "akanjs/base";
import { Logger } from "akanjs/common";

export type ErrorReportSource = "server" | "render" | "client" | "process";

export interface ErrorReportContext {
  source: ErrorReportSource;
  /** The request id `x-request-id` names; for a browser report, the id of the page view it came from. */
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

interface MinuteCap {
  limit: number;
  what: string;
  taken: number[];
  dropping: boolean;
}

export class ErrorReporting {
  static readonly flushTimeoutMs = 2_000;
  static readonly perMinute = 600;
  static readonly processPerMinute = 10;
  static #reporter: ErrorReporter | null = null;
  static #failureLogged = false;
  static readonly #reported = new WeakSet<object>();
  static readonly #pending = new Set<Promise<void>>();
  //? Knows a report raised inside the reporter's own call. Bun runs `unhandledRejection` outside that context, so a
  //? reporter's detached rejection is not known here, and the caps below are what bounds it.
  static readonly #inReporter = new AsyncLocalStorage<true>();
  static readonly #logger = new Logger("ErrorReporter");
  static readonly #caps: Record<"all" | "process", MinuteCap> = {
    all: { limit: ErrorReporting.perMinute, what: "errors", taken: [], dropping: false },
    process: { limit: ErrorReporting.processPerMinute, what: "process errors", taken: [], dropping: false },
  };

  static use(reporter: ErrorReporter | null) {
    ErrorReporting.#reporter = reporter;
    ErrorReporting.#failureLogged = false;
    for (const cap of Object.values(ErrorReporting.#caps)) Object.assign(cap, { taken: [], dropping: false });
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
    if (!ErrorReporting.#admitted(input.source)) return;
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

  static #admitted(source: ErrorReportSource): boolean {
    const now = Date.now();
    const caps =
      source === "process" ? [ErrorReporting.#caps.process, ErrorReporting.#caps.all] : [ErrorReporting.#caps.all];
    if (!caps.every((cap) => ErrorReporting.#hasRoom(cap, now))) return false;
    for (const cap of caps) cap.taken.push(now);
    return true;
  }

  static #hasRoom(cap: MinuteCap, now: number): boolean {
    while (cap.taken.length && now - (cap.taken[0] ?? now) >= 60_000) cap.taken.shift();
    if (cap.taken.length < cap.limit) {
      cap.dropping = false;
      return true;
    }
    if (!cap.dropping)
      ErrorReporting.#logger.warn(
        `The error reporter got ${cap.limit} ${cap.what} within a minute; further ones are skipped until the rate falls`,
      );
    cap.dropping = true;
    return false;
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
    if (typeof failure === "object" && failure !== null) ErrorReporting.#reported.add(failure);
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
