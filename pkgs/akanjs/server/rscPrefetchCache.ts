import type { PrefetchPriority } from "../client/rscNavigation";

interface RscPrefetchEntry {
  account: string;
  startedAt: number;
  controller: AbortController;
  response: Promise<Response | null>;
  release: () => void;
}

interface RscPrefetchQueued {
  account: string;
}

export interface RscPrefetched {
  response: Promise<Response | null>;
  fresh: boolean;
}

export interface RscPrefetchCacheOptions {
  fetchResponse: (href: string, signal: AbortSignal) => Promise<Response>;
  ttlMs?: number;
  freshMs?: number;
  maxConcurrent?: number;
  maxEntries?: number;
  maxQueued?: number;
  now?: () => number;
}

export class RscPrefetchCache {
  static readonly defaultTtlMs = 15_000;
  //? Hover to click falls well inside it, and a slow render's own data is as old by its commit; older is a replay.
  static readonly defaultFreshMs = 5_000;
  //? Two, so an HTTP/1.1 origin's six connections keep room for the navigation and the page's own queries.
  static readonly defaultMaxConcurrent = 2;
  static readonly defaultMaxEntries = 16;
  static readonly defaultMaxQueued = 16;
  static readonly #none = () => undefined;

  #fetchResponse: RscPrefetchCacheOptions["fetchResponse"];
  #ttlMs: number;
  #freshMs: number;
  #maxConcurrent: number;
  #maxEntries: number;
  #maxQueued: number;
  #now: () => number;
  #entries = new Map<string, RscPrefetchEntry>();
  #high = new Map<string, RscPrefetchQueued>();
  #low = new Map<string, RscPrefetchQueued>();
  #active = 0;

  constructor(options: RscPrefetchCacheOptions) {
    this.#fetchResponse = options.fetchResponse;
    this.#ttlMs = options.ttlMs ?? RscPrefetchCache.defaultTtlMs;
    this.#freshMs = options.freshMs ?? RscPrefetchCache.defaultFreshMs;
    this.#maxConcurrent = options.maxConcurrent ?? RscPrefetchCache.defaultMaxConcurrent;
    this.#maxEntries = options.maxEntries ?? RscPrefetchCache.defaultMaxEntries;
    this.#maxQueued = options.maxQueued ?? RscPrefetchCache.defaultMaxQueued;
    this.#now = options.now ?? (() => Date.now());
  }

  get activeCount() {
    return this.#active;
  }

  get queuedCount() {
    return this.#high.size + this.#low.size;
  }

  has(href: string, account: string) {
    const entry = this.#entries.get(href);
    return !!entry && entry.account === account && !this.#isStale(entry);
  }

  //? Newest pointed-at link first, the likeliest click; a link that merely came into view waits behind all of them, and a
  //? full queue of those keeps the first to come into view, as a page lists its links top down.
  request(href: string, account: string, priority: PrefetchPriority = "high"): () => void {
    this.#sweep();
    if (this.has(href, account)) return RscPrefetchCache.#none;
    if (priority === "low" && this.#high.has(href)) return RscPrefetchCache.#none;
    this.#high.delete(href);
    this.#low.delete(href);
    const queue = priority === "high" ? this.#high : this.#low;
    if (priority === "low" && queue.size >= this.#maxQueued) return RscPrefetchCache.#none;
    const queued: RscPrefetchQueued = { account };
    queue.set(href, queued);
    for (const oldest of queue.keys()) {
      if (queue.size <= this.#maxQueued) break;
      queue.delete(oldest);
    }
    this.#pump();
    return () => {
      if (queue.get(href) === queued) queue.delete(href);
    };
  }

  take(href: string, account: string, signal?: AbortSignal): RscPrefetched | null {
    this.#high.delete(href);
    this.#low.delete(href);
    const entry = this.#entries.get(href);
    if (!entry) return null;
    this.#entries.delete(href);
    if (entry.account !== account || this.#isStale(entry)) {
      RscPrefetchCache.#drop(entry);
      return null;
    }
    signal?.addEventListener("abort", () => entry.controller.abort(), { once: true });
    return { response: entry.response, fresh: this.#now() - entry.startedAt <= this.#freshMs };
  }

  prune(): void {
    this.#high.clear();
    this.#low.clear();
    this.#sweep();
  }

  clear(): void {
    this.#high.clear();
    this.#low.clear();
    for (const entry of this.#entries.values()) RscPrefetchCache.#drop(entry);
    this.#entries.clear();
  }

  #pump(): void {
    while (this.#active < this.#maxConcurrent) {
      const next = this.#dequeue();
      if (!next) return;
      this.#start(...next);
    }
  }

  #dequeue(): [string, string] | undefined {
    const newest = [...this.#high].at(-1);
    if (newest) {
      this.#high.delete(newest[0]);
      return [newest[0], newest[1].account];
    }
    const oldest = this.#low.entries().next().value;
    if (!oldest) return undefined;
    this.#low.delete(oldest[0]);
    return [oldest[0], oldest[1].account];
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
          //? A 204 is a page that opts out of prefetching, kept as nothing for the TTL so hovering again asks no more.
          const optedOut = response.status === 204;
          //? Only what the click would take as its own answer: a 429, 408 or 5xx may be gone by then, so it asks again.
          const usable = response.ok || response.status === 404;
          if (controller.signal.aborted || optedOut || !usable || !response.body) {
            void response.body?.cancel().catch(() => undefined);
            if (!optedOut) forget();
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
