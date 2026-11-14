import type { Logger } from "akanjs/common";
import type {
  AkanChildRole,
  AkanChildStatus,
  AkanIpcMessage,
  AkanMetricsReport,
  AkanRscWorkerStatus,
  AkanUpstream,
} from "akanjs/service";
import type { RestartSchedule } from "../../common/restartSchedule";
import type { BuilderMessage } from "../artifact";

export interface ChildState {
  idx: number;
  role: AkanChildRole;
  proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
  ready: boolean;
  status: AkanChildStatus;
  pid?: number;
  upstream?: AkanUpstream;
  wsUpstream?: Extract<AkanUpstream, { type: "tcp" }>;
  healthPath?: string;
  //? `undefined` is a replica of an earlier release, which reports no worker; it counts as rendering, as it did then.
  rscWorker?: AkanRscWorkerStatus;
  metrics: AkanMetricsReport;
  /** Monotonic (`performance.now()`) so sleep/wake wall-clock jumps cannot fake a health timeout. */
  lastPongAtMono?: number;
  restart: RestartSchedule;
  restartCount: number;
  restartPending: boolean;
  lastExitCode?: number | null;
  lastRestartAt?: number;
  lastRestartReason?: string;
  lastErrorMessage?: string;
}

export class GatewayChildren {
  readonly #logger: Logger;
  readonly #children = new Map<number, ChildState>();
  #rrIdx = 0;
  #federationChildCache: ChildState[] | null = null;
  #renderingChildCache: ChildState[] | null = null;
  #stopping = false;

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  get stopping() {
    return this.#stopping;
  }

  markStopping() {
    this.#stopping = true;
  }

  get size() {
    return this.#children.size;
  }

  get(idx: number) {
    return this.#children.get(idx);
  }

  set(idx: number, child: ChildState) {
    this.#children.set(idx, child);
  }

  values() {
    return this.#children.values();
  }

  clear() {
    this.#children.clear();
  }

  invalidateFederation() {
    this.#federationChildCache = null;
    this.#renderingChildCache = null;
  }

  isUnavailable(child: ChildState): boolean {
    return child.proc.killed || child.status === "exited" || child.status === "crashed";
  }

  federationCandidates() {
    this.#federationChildCache ??= [...this.#children.values()].filter(
      (child) =>
        (child.role === "federation" || child.role === "all") &&
        child.ready &&
        child.status !== "unhealthy" &&
        !this.isUnavailable(child),
    );
    return this.#federationChildCache;
  }

  renderingCandidates() {
    this.#renderingChildCache ??= this.federationCandidates().filter(
      (child) => (child.rscWorker ?? "ready") === "ready",
    );
    return this.#renderingChildCache;
  }

  //? Falls back rather than refusing: API and websocket traffic need no worker, and a queued page waits for its respawn.
  pickFederationChild() {
    const rendering = this.renderingCandidates();
    const candidates = rendering.length > 0 ? rendering : this.federationCandidates();
    if (candidates.length === 0) return null;
    const child = candidates[this.#rrIdx % candidates.length];
    this.#rrIdx++;
    return child;
  }

  updateMetrics(childIdx: number, metrics: AkanMetricsReport) {
    const child = this.#children.get(childIdx);
    if (!child) return;
    child.metrics = { ...child.metrics, pid: metrics.pid ?? child.pid, ...metrics };
  }

  fanoutToFederation(message: AkanIpcMessage | BuilderMessage, exceptIdx?: number) {
    for (const child of this.#children.values()) {
      if (child.idx === exceptIdx) continue;
      if (child.role === "federation" || child.role === "all") this.send(child, message);
    }
  }

  fanoutToAll(message: AkanIpcMessage) {
    for (const child of this.#children.values()) this.send(child, message);
  }

  fanoutToBatch(message: AkanIpcMessage) {
    for (const child of this.#children.values()) {
      if (child.role === "batch" || child.role === "all") {
        if (this.send(child, message) && message.type === "queue.wake") {
          child.metrics.queueWakeCount = (child.metrics.queueWakeCount ?? 0) + 1;
        }
      }
    }
  }

  send(child: ChildState, message: AkanIpcMessage | BuilderMessage): boolean {
    if (this.isUnavailable(child)) return false;
    try {
      child.proc.send(message);
      return true;
    } catch (error) {
      this.#logger.warn(
        `Failed to send ${message.type} to child ${child.idx}/${child.role}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }
}
