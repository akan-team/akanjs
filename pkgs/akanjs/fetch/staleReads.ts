declare global {
  var __AKAN_STALE_READS__: Set<() => void> | undefined;
}

export class StaleReads {
  static readonly #listeners: Set<() => void> = StaleReads.#shared();

  static subscribe(listener: () => void): () => void {
    StaleReads.#listeners.add(listener);
    return () => StaleReads.#listeners.delete(listener);
  }

  //? Each listener on its own: one that throws must neither keep the others stale nor fail the write that marked them.
  static mark(): void {
    for (const listener of StaleReads.#listeners) {
      try {
        listener();
      } catch (error) {
        console.error(`[StaleReads] a listener failed: ${String(error)}`);
      }
    }
  }

  //? Interned: the RSC runtime and the fetch vendor each may carry a copy of this module, and must share one set.
  static #shared(): Set<() => void> {
    globalThis.__AKAN_STALE_READS__ ??= new Set();
    return globalThis.__AKAN_STALE_READS__;
  }
}
