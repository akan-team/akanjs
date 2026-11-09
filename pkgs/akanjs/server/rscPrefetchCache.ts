interface RscPrefetchEntry {
  account: string;
  startedAt: number;
  controller: AbortController;
  response: Promise<Response | null>;
  release: () => void;
}

export interface RscPrefetchCacheOptions {
  fetchResponse: (href: string, signal: AbortSignal) => Promise<Response>;
  ttlMs?: number;
  maxConcurrent?: number;
  maxEntries?: number;
  maxQueued?: number;
  now?: () => number;
}

export class RscPrefetchCache {
  static readonly defaultTtlMs = 30_000;
  //? Two, so an HTTP/1.1 origin's six connections keep room for the navigation and the page's own queries.
  static readonly defaultMaxConcurrent = 2;
  static readonly defaultMaxEntries = 16;
  static readonly defaultMaxQueued = 16;

  #fetchResponse: RscPrefetchCacheOptions["fetchResponse"];
  #ttlMs: number;
  #maxConcurrent: number;
  #maxEntries: number;
  #maxQueued: number;
  #now: () => number;
  #entries = new Map<string, RscPrefetchEntry>();
  #queue = new Map<string, string>();
  #active = 0;

  constructor(options: RscPrefetchCacheOptions) {
    this.#fetchResponse = options.fetchResponse;
    this.#ttlMs = options.ttlMs ?? RscPrefetchCache.defaultTtlMs;
    this.#maxConcurrent = options.maxConcurrent ?? RscPrefetchCache.defaultMaxConcurrent;
    this.#maxEntries = options.maxEntries ?? RscPrefetchCache.defaultMaxEntries;
    this.#maxQueued = options.maxQueued ?? RscPrefetchCache.defaultMaxQueued;
    this.#now = options.now ?? Date.now;
  }

  get activeCount() {
    return this.#active;
  }

  get queuedCount() {
    return this.#queue.size;
  }

  has(href: string, account: string) {
    const entry = this.#entries.get(href);
    return !!entry && entry.account === account && !this.#isStale(entry);
  }

  request(href: string, account: string): void {
    this.#sweep();
    if (this.has(href, account)) return;
    this.#queue.delete(href);
    this.#queue.set(href, account);
    for (const oldest of this.#queue.keys()) {
      if (this.#queue.size <= this.#maxQueued) break;
      this.#queue.delete(oldest);
    }
    this.#pump();
  }

  take(href: string, account: string, signal?: AbortSignal): Promise<Response | null> | null {
    this.#queue.delete(href);
    const entry = this.#entries.get(href);
    if (!entry) return null;
    this.#entries.delete(href);
    if (entry.account !== account || this.#isStale(entry)) {
      RscPrefetchCache.#drop(entry);
      return null;
    }
    signal?.addEventListener("abort", () => entry.controller.abort(), { once: true });
    return entry.response;
  }

  dropQueued(): void {
    this.#queue.clear();
  }

  clear(): void {
    this.#queue.clear();
    for (const entry of this.#entries.values()) RscPrefetchCache.#drop(entry);
    this.#entries.clear();
  }

  #pump(): void {
    for (const [href, account] of this.#queue) {
      if (this.#active >= this.#maxConcurrent) return;
      this.#queue.delete(href);
      this.#start(href, account);
    }
  }

  #start(href: string, account: string): void {
    const previous = this.#entries.get(href);
    if (previous) {
      this.#entries.delete(href);
      RscPrefetchCache.#drop(previous);
    }
    const controller = new AbortController();
    let kept: ReadableStream<Uint8Array> | null = null;
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      this.#active -= 1;
      this.#pump();
    };
    const forget = () => {
      if (this.#entries.get(href) === entry) this.#entries.delete(href);
    };
    this.#active += 1;
    const entry: RscPrefetchEntry = {
      account,
      startedAt: this.#now(),
      controller,
      response: this.#fetchResponse(href, controller.signal).then(
        (response) => {
          //? A server error may be gone by the click, so the navigation asks again rather than replaying it.
          if (controller.signal.aborted || response.status >= 500 || !response.body) {
            void response.body?.cancel().catch(() => undefined);
            forget();
            settle();
            return null;
          }
          //? Drained to its end, so an unread body never holds a connection; the other branch keeps the bytes.
          const [drain, branch] = response.body.tee();
          kept = branch;
          void RscPrefetchCache.#readToEnd(drain).then(settle, () => {
            forget();
            settle();
          });
          return new Response(branch, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        },
        () => {
          forget();
          settle();
          return null;
        },
      ),
      release: () => {
        void kept?.cancel().catch(() => undefined);
      },
    };
    this.#entries.set(href, entry);
    for (const [oldestHref, oldest] of this.#entries) {
      if (this.#entries.size <= this.#maxEntries) break;
      this.#entries.delete(oldestHref);
      RscPrefetchCache.#drop(oldest);
    }
  }

  #sweep(): void {
    for (const [href, entry] of this.#entries) {
      if (!this.#isStale(entry)) continue;
      this.#entries.delete(href);
      RscPrefetchCache.#drop(entry);
    }
  }

  #isStale(entry: RscPrefetchEntry): boolean {
    return this.#now() - entry.startedAt > this.#ttlMs;
  }

  static async #readToEnd(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    while (!(await reader.read()).done);
  }

  static #drop(entry: RscPrefetchEntry): void {
    entry.controller.abort();
    entry.release();
  }
}
