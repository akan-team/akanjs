import { getCurrentTrace } from "../signal/trace";
import { AdmissionQueue, type AdmissionQueueOptions } from "./admissionQueue";
import { metricRegistry } from "./metrics/metricRegistry";
import { ServerLimits } from "./routing/serverLimits";
import { RscRenderRefusal } from "./rscRenderRefusal";

type Env = Record<string, string | undefined>;

export class RscRenderAdmission {
  static readonly defaultMaxConcurrency = 0;
  readonly #queue: AdmissionQueue;
  readonly #capped: boolean;
  readonly #inFlight = metricRegistry.gauge(
    "akan_rsc_renders_in_flight",
    "Renders the RSC worker is running, a replay of a stored result not among them.",
  );
  readonly #depth = metricRegistry.gauge(
    "akan_rsc_render_queue_depth",
    "Renders waiting in the RSC worker for one of its render slots.",
  );
  readonly #wait = metricRegistry.histogram(
    "akan_rsc_render_queue_wait_seconds",
    "Time a render waited for a render slot before it started.",
  );
  readonly #refusals = metricRegistry.counter(
    "akan_rsc_render_refusals_total",
    "Renders answered 503 without rendering, by whether the queue was full or the render waited too long.",
    ["reason"],
  );

  constructor(options: AdmissionQueueOptions = RscRenderAdmission.options()) {
    this.#queue = new AdmissionQueue(options);
    this.#capped = options.limit > 0;
  }

  //? At a second a render the slots drain this queue within the idle timeout; past either, the client has gone.
  static options(env: Env = process.env): AdmissionQueueOptions {
    const limit =
      RscRenderAdmission.#count(env.AKAN_RSC_WORKER_MAX_CONCURRENCY) ?? RscRenderAdmission.defaultMaxConcurrency;
    if (limit <= 0) return { limit: 0, maxQueue: 0, maxWaitMs: 0 };
    const idleSeconds = new ServerLimits(env).idleTimeout;
    const maxQueue =
      RscRenderAdmission.#count(env.AKAN_RSC_WORKER_MAX_QUEUE) ??
      limit * (idleSeconds || ServerLimits.defaultIdleSeconds);
    return { limit, maxQueue, maxWaitMs: idleSeconds * 1000 };
  }

  static #count(raw: string | undefined): number | null {
    const value = raw?.trim().toLowerCase();
    if (!value) return null;
    if (value === "off") return 0;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  }

  async enter(requestId: string, isCancelled: () => boolean): Promise<boolean> {
    if (isCancelled()) return false;
    const outcome = await this.#queue.enter(requestId);
    if (!outcome.admitted) {
      if (outcome.reason === "left") return false;
      this.#refusals.inc({ reason: outcome.reason });
      throw RscRenderRefusal.of(
        outcome.reason,
        outcome.reason === "queue-full"
          ? `render queue is full: ${this.#queue.waiting} renders wait for ${this.#queue.limit} slots`
          : `render waited ${Math.round(outcome.waitedMs)} ms for one of ${this.#queue.limit} slots`,
      );
    }
    if (!this.#capped) return true;
    this.#wait.observe(outcome.waitedMs / 1000);
    if (!outcome.queued) return true;
    const trace = getCurrentTrace();
    trace?.recordSpan("renderQueue", outcome.waitedMs);
    trace?.setAttr("queueMs", Math.round(outcome.waitedMs * 10) / 10);
    //? A cancel read in the turn that freed the slot comes after the slot was handed over and before this resumes.
    return !isCancelled();
  }

  leave(requestId: string): void {
    this.#queue.leave(requestId);
  }

  sample(): void {
    this.#inFlight.set(this.#queue.inFlight);
    this.#depth.set(this.#queue.waiting);
  }
}
