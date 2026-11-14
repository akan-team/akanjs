export type AdmissionRefusal = "queue-full" | "wait-timeout";

export type AdmissionOutcome =
  | { admitted: true; queued: boolean; waitedMs: number }
  | { admitted: false; reason: AdmissionRefusal | "left"; waitedMs: number };

export interface AdmissionQueueOptions {
  limit: number;
  maxQueue: number;
  maxWaitMs: number;
}

interface AdmissionWaiter {
  enqueuedAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  settle: (outcome: AdmissionOutcome) => void;
}

export class AdmissionQueue {
  readonly #limit: number;
  readonly #maxQueue: number;
  readonly #maxWaitMs: number;
  readonly #holders = new Set<string>();
  //? A Map iterates in insertion order, which is the queue's order, and drops a waiter that left without a scan.
  readonly #waiters = new Map<string, AdmissionWaiter>();

  constructor({ limit, maxQueue, maxWaitMs }: AdmissionQueueOptions) {
    this.#limit = limit > 0 ? Math.floor(limit) : Number.POSITIVE_INFINITY;
    this.#maxQueue = Math.max(0, Math.floor(maxQueue));
    this.#maxWaitMs = Math.max(0, maxWaitMs);
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
  enter(key: string): Promise<AdmissionOutcome> {
    if (this.#holders.has(key) || this.#holders.size < this.#limit) {
      this.#holders.add(key);
      return Promise.resolve({ admitted: true, queued: false, waitedMs: 0 });
    }
    if (this.#maxQueue > 0 && this.#waiters.size >= this.#maxQueue)
      return Promise.resolve({ admitted: false, reason: "queue-full", waitedMs: 0 });
    return new Promise<AdmissionOutcome>((settle) => {
      const timer = this.#maxWaitMs > 0 ? setTimeout(() => this.#drop(key, "wait-timeout"), this.#maxWaitMs) : null;
      this.#waiters.set(key, { enqueuedAt: performance.now(), timer, settle });
    });
  }

  leave(key: string): void {
    if (this.#holders.delete(key)) this.#admitNext();
    else this.#drop(key, "left");
  }

  #admitNext(): void {
    const next = this.#waiters.entries().next();
    if (next.done) return;
    const [key, waiter] = next.value;
    this.#waiters.delete(key);
    if (waiter.timer) clearTimeout(waiter.timer);
    this.#holders.add(key);
    waiter.settle({ admitted: true, queued: true, waitedMs: performance.now() - waiter.enqueuedAt });
  }

  #drop(key: string, reason: AdmissionRefusal | "left"): void {
    const waiter = this.#waiters.get(key);
    if (!waiter) return;
    this.#waiters.delete(key);
    if (waiter.timer) clearTimeout(waiter.timer);
    waiter.settle({ admitted: false, reason, waitedMs: performance.now() - waiter.enqueuedAt });
  }
}
