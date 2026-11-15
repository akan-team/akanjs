export type AdmissionRefusal = "queue-full" | "wait-timeout";

export type AdmissionOutcome =
  | { admitted: true; queued: boolean; waitedMs: number }
  | { admitted: false; reason: AdmissionRefusal | "left"; waitedMs: number };

export interface AdmissionQueueOptions {
  limit: number;
  maxQueue: number;
  maxWaitMs: number;
  maxHoldMs?: number;
  onHoldExpired?: (key: string) => void;
}

interface AdmissionWaiter {
  enqueuedAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  settle: (outcome: AdmissionOutcome) => void;
}

type AdmissionTimer = ReturnType<typeof setTimeout> | null;

export class AdmissionQueue {
  static readonly #now: AdmissionOutcome = { admitted: true, queued: false, waitedMs: 0 };
  static readonly #full: AdmissionOutcome = { admitted: false, reason: "queue-full", waitedMs: 0 };
  readonly #limit: number;
  readonly #maxQueue: number;
  readonly #maxWaitMs: number;
  readonly #maxHoldMs: number;
  readonly #onHoldExpired: ((key: string) => void) | undefined;
  readonly #holders = new Map<string, AdmissionTimer>();
  //? A Map iterates in insertion order, which is the queue's order, and drops a waiter that left without a scan.
  readonly #waiters = new Map<string, AdmissionWaiter>();

  constructor({ limit, maxQueue, maxWaitMs, maxHoldMs = 0, onHoldExpired }: AdmissionQueueOptions) {
    this.#limit = limit > 0 ? Math.floor(limit) : Number.POSITIVE_INFINITY;
    this.#maxQueue = Math.max(0, Math.floor(maxQueue));
    this.#maxWaitMs = Math.max(0, maxWaitMs);
    this.#maxHoldMs = Math.max(0, maxHoldMs);
    this.#onHoldExpired = onHoldExpired;
  }

  get limit(): number {
    return this.#limit;
  }

  get inFlight(): number {
    return this.#holders.size;
  }

  get waiting(): number {
    return this.#waiters.size;
  }

  //? A free slot means nobody waits: `leave` hands a slot to the first waiter in the same turn, so none can be passed.
  enter(key: string): AdmissionOutcome | Promise<AdmissionOutcome> {
    if (this.#holders.has(key)) return AdmissionQueue.#now;
    if (this.#holders.size < this.#limit) {
      this.#hold(key);
      return AdmissionQueue.#now;
    }
    if (this.#maxQueue > 0 && this.#waiters.size >= this.#maxQueue) return AdmissionQueue.#full;
    return new Promise<AdmissionOutcome>((settle) => {
      const timer = this.#maxWaitMs > 0 ? setTimeout(() => this.#drop(key, "wait-timeout"), this.#maxWaitMs) : null;
      this.#waiters.set(key, { enqueuedAt: performance.now(), timer, settle });
    });
  }

  leave(key: string): "held" | "waited" | null {
    if (this.#release(key)) return "held";
    return this.#drop(key, "left") ? "waited" : null;
  }

  #hold(key: string): void {
    const expire = () => {
      if (this.#release(key)) this.#onHoldExpired?.(key);
    };
    this.#holders.set(key, this.#maxHoldMs > 0 ? setTimeout(expire, this.#maxHoldMs) : null);
  }

  #release(key: string): boolean {
    const timer = this.#holders.get(key);
    if (timer === undefined) return false;
    if (timer) clearTimeout(timer);
    this.#holders.delete(key);
    this.#admitNext();
    return true;
  }

  #admitNext(): void {
    const next = this.#waiters.entries().next();
    if (next.done) return;
    const [key, waiter] = next.value;
    this.#waiters.delete(key);
    if (waiter.timer) clearTimeout(waiter.timer);
    this.#hold(key);
    waiter.settle({ admitted: true, queued: true, waitedMs: performance.now() - waiter.enqueuedAt });
  }

  #drop(key: string, reason: AdmissionRefusal | "left"): boolean {
    const waiter = this.#waiters.get(key);
    if (!waiter) return false;
    this.#waiters.delete(key);
    if (waiter.timer) clearTimeout(waiter.timer);
    waiter.settle({ admitted: false, reason, waitedMs: performance.now() - waiter.enqueuedAt });
    return true;
  }
}
