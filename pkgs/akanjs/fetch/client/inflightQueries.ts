import { StaleReads } from "../staleReads";

interface InflightQuery {
  value: Promise<unknown>;
  controller: AbortController;
  waiters: number;
}

export class InflightQueries {
  readonly #entries = new Map<string, InflightQuery>();
  readonly #copy: (value: unknown) => unknown;

  constructor(copy: (value: unknown) => unknown) {
    this.#copy = copy;
  }

  //? A joiner's copy is taken as the answer lands, before the caller that started it can change what it was handed.
  claim<T>(key: string, start: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal) {
    if (signal?.aborted) return Promise.reject(signal.reason) as Promise<T>;
    const existing = this.#entries.get(key);
    const entry = existing ?? this.#start(key, start);
    entry.waiters += 1;
    const value = existing ? entry.value.then(this.#copy) : entry.value;
    return this.#follow(key, entry, value, signal) as Promise<T>;
  }

  detach() {
    this.#entries.clear();
  }

  //? A query sent before a write or a credential change may answer what no longer holds, so later calls send their own.
  forget() {
    this.detach();
    StaleReads.mark();
  }

  async writing<T>(write: () => Promise<T>, keepsReads?: boolean): Promise<T> {
    if (keepsReads) return await write();
    this.forget();
    try {
      return await write();
    } finally {
      this.forget();
    }
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

  #follow(key: string, entry: InflightQuery, value: Promise<unknown>, signal?: AbortSignal) {
    if (!signal) return value;
    return new Promise<unknown>((resolve, reject) => {
      const leave = () => {
        reject(signal.reason);
        entry.waiters -= 1;
        if (entry.waiters > 0) return;
        if (this.#entries.get(key) === entry) this.#entries.delete(key);
        entry.controller.abort(signal.reason);
      };
      signal.addEventListener("abort", leave, { once: true });
      value.then(resolve, reject).finally(() => signal.removeEventListener("abort", leave));
    });
  }
}
