declare global {
  var __AKAN_STALE_READS__: Set<() => void> | undefined;
}

export class StaleReads {
  static readonly #listeners: Set<() => void> = StaleReads.#shared();

  static subscribe(listener: () => void): () => void {
    StaleReads.#listeners.add(listener);
    return () => StaleReads.#listeners.delete(listener);
  }

  static mark(): void {
    for (const listener of StaleReads.#listeners) listener();
  }

  //? Interned: the RSC runtime and the fetch vendor each may carry a copy of this module, and must share one set.
  static #shared(): Set<() => void> {
    globalThis.__AKAN_STALE_READS__ ??= new Set();
    return globalThis.__AKAN_STALE_READS__;
  }
}
