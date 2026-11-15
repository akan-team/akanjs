import type { Logger } from "akanjs/common";
import { getCurrentTrace } from "../signal/trace";
import { type AdmissionOutcome, AdmissionQueue, type AdmissionQueueOptions } from "./admissionQueue";
import { metricRegistry } from "./metrics/metricRegistry";
import { ServerLimits } from "./routing/serverLimits";
import { RscRenderLevels } from "./rscRenderLevels";
import { RscRenderRefusal } from "./rscRenderRefusal";

type Env = Record<string, string | undefined>;

export class RscRenderAdmission {
  static readonly defaultMaxConcurrency = 0;
  static readonly #warned = new Set<string>();
  readonly #queue: AdmissionQueue | null;
  readonly #abandoned = new Set<string>();
  #running = 0;
  readonly #inFlight = metricRegistry.gauge(
    "akan_rsc_renders_in_flight",
    "Renders the RSC worker is running, a replay of a stored result not among them; under a cap, those holding a slot.",
  );
  readonly #depth = metricRegistry.gauge(
    "akan_rsc_render_queue_depth",
    "Renders waiting in the RSC worker for one of its render slots.",
  );
  readonly #released = metricRegistry.gauge(
    "akan_rsc_renders_abandoned",
    "Renders still running after their slot was given up: cancelled by their client, or past the hold limit.",
  );
  readonly #wait = metricRegistry.histogram(
    "akan_rsc_render_queue_wait_seconds",
    "Time a render waited for a render slot before it started.",
  );
  readonly #refusals = metricRegistry.counter(
    "akan_rsc_render_refusals_total",
    "Renders answered 503 without rendering (queue-full, wait-timeout), and slots taken back from a render that held one too long (hold-timeout).",
    ["reason"],
  );

  constructor(options: AdmissionQueueOptions = RscRenderAdmission.options()) {
    if (options.limit <= 0) {
      this.#queue = null;
      return;
    }
    RscRenderLevels.track();
    this.#queue = new AdmissionQueue({
      ...options,
      onHoldExpired: (requestId) => {
        this.#refusals.inc({ reason: "hold-timeout" });
        this.#abandoned.add(requestId);
      },
    });
  }

  //? At a second a render the slots drain this queue within the idle timeout; past it a waiting client has gone.
  //? Bun never times out a pending handler, so only the hold limit frees a slot whose page waits on dead data.
  static options(env: Env = process.env, logger?: Logger): AdmissionQueueOptions {
    const limit = RscRenderAdmission.#count(env, "AKAN_RSC_WORKER_MAX_CONCURRENCY", logger);
    if (!limit) return { limit: 0, maxQueue: 0, maxWaitMs: 0, maxHoldMs: 0 };
    const seconds = new ServerLimits(env).idleTimeout || ServerLimits.defaultIdleSeconds;
    const maxQueue = RscRenderAdmission.#count(env, "AKAN_RSC_WORKER_MAX_QUEUE", logger) ?? limit * seconds;
    return { limit, maxQueue, maxWaitMs: seconds * 1000, maxHoldMs: seconds * 1000 };
  }

  static #count(env: Env, name: string, logger: Logger | undefined): number | null {
    const raw = env[name]?.trim();
    if (!raw) return null;
    if (raw.toLowerCase() === "off") return 0;
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed >= 0) return parsed;
    const key = `${name}=${raw}`;
    if (logger && !RscRenderAdmission.#warned.has(key)) {
      RscRenderAdmission.#warned.add(key);
      logger.warn(`${name}="${raw}" is not a whole number such as 8, or off; using the default.`);
    }
    return null;
  }

  enter(requestId: string, isCancelled: () => boolean): boolean | Promise<boolean> {
    const queue = this.#queue;
    if (!queue) {
      this.#running += 1;
      return true;
    }
    if (isCancelled()) return false;
    const outcome = queue.enter(requestId);
    if (outcome instanceof Promise) return outcome.then((waited) => this.#admitted(queue, waited, isCancelled));
    return this.#admitted(queue, outcome, isCancelled);
  }

  #admitted(queue: AdmissionQueue, outcome: AdmissionOutcome, isCancelled: () => boolean): boolean {
    if (!outcome.admitted) {
      if (outcome.reason === "left") return false;
      this.#refusals.inc({ reason: outcome.reason });
      throw RscRenderRefusal.of(
        outcome.reason,
        outcome.reason === "queue-full"
          ? `render queue is full: ${queue.waiting} renders wait for ${queue.limit} slots`
          : `render waited ${Math.round(outcome.waitedMs)} ms for one of ${queue.limit} slots`,
      );
    }
    this.#wait.observe(outcome.waitedMs / 1000);
    if (!outcome.queued) return true;
    const trace = getCurrentTrace();
    trace?.recordSpan("renderQueue", outcome.waitedMs);
    trace?.setAttr("queueMs", Math.round(outcome.waitedMs * 10) / 10);
    //? A cancel read in the turn that freed the slot comes after the slot was handed over and before this resumes.
    return !isCancelled();
  }

  abandon(requestId: string): void {
    if (this.#queue?.leave(requestId) === "held") this.#abandoned.add(requestId);
  }

  leave(requestId: string, request: Request | null): void {
    const queue = this.#queue;
    if (!queue) {
      this.#running -= 1;
      return;
    }
    queue.leave(requestId);
    if (!this.#abandoned.has(requestId)) return;
    const levels = RscRenderLevels.of(request);
    if (levels) levels.whenSettled(() => this.#abandoned.delete(requestId));
    else this.#abandoned.delete(requestId);
  }

  sample(): void {
    this.#inFlight.set(this.#queue?.inFlight ?? this.#running);
    this.#depth.set(this.#queue?.waiting ?? 0);
    this.#released.set(this.#abandoned.size);
  }
}
