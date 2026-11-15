import { AdmissionQueue } from "./admissionQueue";
import { isPublicRouteCacheableRequest } from "./cachePolicy";
import type { RscPending } from "./rscHostRenderStream";

type Env = Record<string, string | undefined>;

export type RscHostGateRelease = "end" | "first" | number;

export interface RscHostGateCounts {
  rscHostGateInFlight: number;
  rscHostGateWaiting: number;
  rscHostGateAdmitted: number;
  rscHostGateQueued: number;
  rscHostGateWaitMs: number;
  rscHostGatePassed: number;
}

export class RscHostGate {
  readonly #queue: AdmissionQueue;
  readonly #release: RscHostGateRelease;
  readonly #passesPublic: boolean;
  readonly #timers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #waitingIds = new Set<string>();
  #admitted = 0;
  #queued = 0;
  #waitMs = 0;
  #passed = 0;

  constructor(limit: number, release: RscHostGateRelease = "end", { passesPublic = false } = {}) {
    this.#queue = new AdmissionQueue({ limit, maxQueue: 0, maxWaitMs: 0 });
    this.#release = release;
    this.#passesPublic = passesPublic;
  }

  static from(env: Env = process.env): RscHostGate | null {
    const limit = Number(env.AKAN_RSC_HOST_MAX_CONCURRENCY?.trim() || 0);
    if (!Number.isInteger(limit) || limit <= 0) return null;
    const raw = env.AKAN_RSC_HOST_RELEASE?.trim() ?? "";
    const ms = Number(raw);
    return new RscHostGate(limit, raw === "first" ? "first" : raw && Number.isFinite(ms) && ms > 0 ? ms : "end", {
      passesPublic: env.AKAN_RSC_HOST_PASS_PUBLIC === "1",
    });
  }

  //? Only the worker knows which pages it has stored. A request with no credentials is the only kind it stores, so
  //? letting those past is the nearest the host comes to "a stored page takes no slot" without asking the worker.
  takes(request: Request): boolean {
    if (!this.#passesPublic || !isPublicRouteCacheableRequest(request)) return true;
    this.#passed += 1;
    return false;
  }

  isWaiting(requestId: string): boolean {
    return this.#waitingIds.has(requestId);
  }

  enter(requestId: string, send: () => void): void {
    const outcome = this.#queue.enter(requestId);
    if (!(outcome instanceof Promise)) {
      this.#start(requestId, send, 0);
      return;
    }
    this.#waitingIds.add(requestId);
    void outcome.then((waited) => {
      this.#waitingIds.delete(requestId);
      if (!waited.admitted) return;
      this.#queued += 1;
      this.#start(requestId, send, waited.waitedMs);
    });
  }

  #start(requestId: string, send: () => void, waitedMs: number): void {
    this.#admitted += 1;
    this.#waitMs += waitedMs;
    if (typeof this.#release === "number")
      this.#timers.set(
        requestId,
        setTimeout(() => this.leave(requestId), this.#release),
      );
    send();
  }

  leave(requestId: string): "held" | "waited" | null {
    const timer = this.#timers.get(requestId);
    if (timer) {
      clearTimeout(timer);
      this.#timers.delete(requestId);
    }
    return this.#queue.leave(requestId);
  }

  watching(requestId: string, pending: RscPending): RscPending {
    const done = () => void this.leave(requestId);
    const first = this.#release === "first" ? done : () => undefined;
    return {
      ...pending,
      onMeta: (meta) => {
        pending.onMeta?.(meta);
        first();
      },
      onChunk: (data) => {
        pending.onChunk(data);
        first();
      },
      onEnd: () => {
        pending.onEnd();
        done();
      },
      onError: (message, code) => {
        pending.onError(message, code);
        done();
      },
      onRedirect: (location, method, status) => {
        pending.onRedirect?.(location, method, status);
        done();
      },
      onNotFound: () => {
        pending.onNotFound?.();
        done();
      },
    };
  }

  counts(): RscHostGateCounts {
    return {
      rscHostGateInFlight: this.#queue.inFlight,
      rscHostGateWaiting: this.#queue.waiting,
      rscHostGateAdmitted: this.#admitted,
      rscHostGateQueued: this.#queued,
      rscHostGateWaitMs: Math.round(this.#waitMs),
      rscHostGatePassed: this.#passed,
    };
  }
}
