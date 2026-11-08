export interface FailureLimiterOptions {
  limit: number;
  windowMs?: number;
  maxClients?: number;
}

//* Per address, never global, or a failing caller locks out a valid one; an unknown address is never counted.
export class FailureLimiter {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #maxClients: number;
  readonly #failures = new Map<string, number[]>();

  constructor({ limit, windowMs = 60_000, maxClients = 10_000 }: FailureLimiterOptions) {
    this.#limit = limit;
    this.#windowMs = windowMs;
    this.#maxClients = maxClients;
  }

  blocked(client: string | null | undefined, now = Date.now()): boolean {
    if (!client) return false;
    return this.#recent(client, now).length >= this.#limit;
  }

  fail(client: string | null | undefined, now = Date.now()) {
    if (!client) return;
    const recent = this.#recent(client, now);
    this.#failures.delete(client);
    while (this.#failures.size >= this.#maxClients) {
      const oldest = this.#failures.keys().next().value;
      if (oldest === undefined) break;
      this.#failures.delete(oldest);
    }
    this.#failures.set(client, [...recent, now].slice(-this.#limit));
  }

  #recent(client: string, now: number) {
    const recent = (this.#failures.get(client) ?? []).filter((at) => now - at < this.#windowMs);
    if (recent.length) this.#failures.set(client, recent);
    else this.#failures.delete(client);
    return recent;
  }
}
