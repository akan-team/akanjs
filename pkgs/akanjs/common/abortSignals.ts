export class AbortSignals {
  //? `AbortSignal.any` arrived in Safari 17.4, and an iOS 16 WebView still runs the page.
  static any(signals: (AbortSignal | null | undefined)[]): AbortSignal | undefined {
    const live = signals.filter((signal): signal is AbortSignal => !!signal);
    if (live.length <= 1) return live[0];
    if (typeof AbortSignal.any === "function") return AbortSignal.any(live);
    const controller = new AbortController();
    for (const signal of live) {
      if (signal.aborted) {
        controller.abort(signal.reason);
        break;
      }
      signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
    }
    return controller.signal;
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
