export interface BackoffPolicy {
  /** The first wait in ms; each attempt in a row doubles it. */
  min?: number;
  max?: number;
  /** The share of each wait drawn at random, 0 to 1, so callers one outage dropped together come back apart. */
  jitter?: number;
}

export class Backoff {
  static delay(attempt: number, { min = 1_000, max = 30_000, jitter = 0.5 }: BackoffPolicy = {}) {
    const ceiling = Math.min(max, min * 2 ** Math.max(0, attempt - 1));
    return Math.round(ceiling * (1 - Math.min(1, Math.max(0, jitter)) * Math.random()));
  }
}
