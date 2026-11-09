export class AbortSignals {
  static readonly #noop = () => undefined;

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
      return Promise.reject(signal.reason);
    }
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
  }

  static isAbort(error: unknown) {
    return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
  }
}
