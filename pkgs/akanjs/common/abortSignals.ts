export class AbortSignals {
  static readonly #noop = () => undefined;
  static readonly #reasons = new WeakSet<object>();

  //? `AbortSignal.any` arrived in Safari 17.4 and an iOS 16 WebView lacks it; the by-hand join listens until `dispose`.
  static join(signals: (AbortSignal | null | undefined)[]): { signal?: AbortSignal; dispose: () => void } {
    const live = signals.filter((signal): signal is AbortSignal => !!signal);
    if (live.length <= 1) return { signal: live[0], dispose: AbortSignals.#noop };
    if (typeof AbortSignal.any === "function") return { signal: AbortSignal.any(live), dispose: AbortSignals.#noop };
    const controller = new AbortController();
    const aborted = live.find((signal) => signal.aborted);
    if (aborted) {
      controller.abort(aborted.reason);
      return { signal: controller.signal, dispose: AbortSignals.#noop };
    }
    const listeners = live.map((signal) => {
      const abort = () => {
        dispose();
        controller.abort(signal.reason);
      };
      signal.addEventListener("abort", abort, { once: true });
      return [signal, abort] as const;
    });
    const dispose = () => {
      for (const [signal, abort] of listeners) signal.removeEventListener("abort", abort);
    };
    return { signal: controller.signal, dispose };
  }

  static race<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) {
      void promise.catch(() => undefined);
      return Promise.reject(AbortSignals.reasonOf(signal));
    }
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(AbortSignals.reasonOf(signal));
      signal.addEventListener("abort", abort, { once: true });
      promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
  }

  static reasonOf(signal: AbortSignal): unknown {
    const reason: unknown = signal.reason;
    if (typeof reason === "object" && reason !== null && AbortSignals.#isQuiet(reason, signal))
      AbortSignals.#reasons.add(reason);
    return reason;
  }

  static isTimeout(signal: AbortSignal) {
    const reason: unknown = signal.reason;
    return reason instanceof Error && reason.name === "TimeoutError";
  }

  static isAbort(error: unknown) {
    if (typeof error !== "object" || error === null) return false;
    return (error as { name?: unknown }).name === "AbortError" || AbortSignals.#reasons.has(error);
  }

  //? A primitive reason (`abort("left")`) cannot be remembered, so it is matched against the signals the call was given.
  static isAbortOf(error: unknown, callArgs: unknown[]) {
    if (AbortSignals.isAbort(error)) return true;
    return callArgs.some((arg) => {
      const signal = AbortSignals.#signalIn(arg);
      return !!signal?.aborted && Object.is(signal.reason, error) && AbortSignals.#isQuiet(error, signal);
    });
  }

  //? An app or restored error that aborted a call is still a failure to show, and so is a timeout.
  static #isQuiet(reason: unknown, signal: AbortSignal) {
    if (AbortSignals.isTimeout(signal)) return false;
    if (typeof reason !== "object" || reason === null) return true;
    const { error, statusCode } = reason as { error?: unknown; statusCode?: unknown };
    return typeof error !== "string" && statusCode === undefined;
  }

  static #signalIn(arg: unknown): AbortSignal | undefined {
    if (typeof AbortSignal === "undefined" || typeof arg !== "object" || arg === null) return undefined;
    if (arg instanceof AbortSignal) return arg;
    const signal = (arg as { signal?: unknown }).signal;
    return signal instanceof AbortSignal ? signal : undefined;
  }
}
