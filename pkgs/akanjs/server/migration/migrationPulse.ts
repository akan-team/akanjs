import type { MigrationLock } from "./migrationLock";

/** What every table call of a run beats: its lease, and a warning once its own transaction has held SQLite long. */
export class MigrationPulse {
  //* SQLite's busy_timeout: past it the live server's writes fail rather than wait for the run's transaction.
  static readonly holdWarnMs = 5_000;
  readonly lock: MigrationLock;
  #onLongHold: ((heldMs: number) => void) | null;
  #heldSince: number | null = null;

  constructor(lock: MigrationLock, onLongHold: ((heldMs: number) => void) | null = null) {
    this.lock = lock;
    this.#onLongHold = onLongHold;
  }

  /** A writer stops once its lease is lost; a reader reads on, as nothing it does clashes with whoever took over. */
  async beat({ strict, force = false }: { strict: boolean; force?: boolean }) {
    try {
      await this.lock.heartbeat({ force });
    } catch (error) {
      if (strict) throw error;
    }
    if (this.#heldSince === null || !this.#onLongHold) return;
    const heldMs = Date.now() - this.#heldSince;
    if (heldMs < MigrationPulse.holdWarnMs) return;
    this.#onLongHold(heldMs);
    this.#onLongHold = null;
  }

  /** Runs `fn` as the span the warning measures: the run's own transaction. */
  async hold<T>(fn: () => Promise<T>) {
    this.#heldSince = Date.now();
    try {
      return await fn();
    } finally {
      this.#heldSince = null;
    }
  }
}
