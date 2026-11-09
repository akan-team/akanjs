interface InflightQuery {
  value: Promise<unknown>;
  controller: AbortController;
  waiters: number;
}

export class InflightQueries {
  readonly #entries = new Map<string, InflightQuery>();

  claim<T>(key: string, start: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal) {
    if (signal?.aborted) return { value: Promise.reject(signal.reason), owned: true };
    const existing = this.#entries.get(key);
    const entry = existing ?? this.#start(key, start);
    entry.waiters += 1;
    return { value: this.#follow(key, entry, signal) as Promise<T>, owned: !existing };
  }

  #start(key: string, start: (signal: AbortSignal) => Promise<unknown>): InflightQuery {
    const controller = new AbortController();
    const settle = () => {
      if (this.#entries.get(key) === entry) this.#entries.delete(key);
    };
    const entry: InflightQuery = { value: start(controller.signal).finally(settle), controller, waiters: 0 };
    //? Every waiter may leave before it settles, and the abort that follows would otherwise go unhandled.
    void entry.value.catch(() => undefined);
    this.#entries.set(key, entry);
    return entry;
  }

  #follow(key: string, entry: InflightQuery, signal?: AbortSignal) {
    if (!signal) return entry.value;
    return new Promise<unknown>((resolve, reject) => {
      const leave = () => {
        reject(signal.reason);
        entry.waiters -= 1;
        if (entry.waiters > 0) return;
        if (this.#entries.get(key) === entry) this.#entries.delete(key);
        entry.controller.abort(signal.reason);
      };
      signal.addEventListener("abort", leave, { once: true });
      entry.value.then(resolve, reject).finally(() => signal.removeEventListener("abort", leave));
    });
  }
}
