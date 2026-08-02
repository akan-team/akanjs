import type { BuilderCsrReq, BuilderCsrRes, BuilderReq, BuilderRes } from "akanjs/server";

type BuilderRequest = BuilderReq | BuilderCsrReq;
type BuilderResponse = BuilderRes | BuilderCsrRes;

/**
 * Correlation ids for builder requests, renumbered by the dev host so they survive a backend restart.
 *
 * `BuilderRpc` numbers its requests from 1 in each backend *process*, and the host relays them to a
 * builder that outlives the backend. So after a restart the two generations collide on id 1: the builder
 * answers the request the *previous* backend made, the host relays it, and the new backend settles its own
 * request of that number with another route's manifest delta — a page rendered against client modules that
 * were never built for it. The answer it was actually waiting for then arrives to an empty pending map and
 * is dropped, so the correct build is discarded too.
 *
 * A host-owned id fixes it without touching the protocol: neither the backend nor the builder learns that
 * anything was renumbered, and a response whose generation is gone is discarded instead of misdelivered.
 */
export class BuilderRequestRouter {
  #generation = 0;
  #nextId = 1;
  readonly #inFlight = new Map<number, { backendId: number; generation: number }>();

  get generation(): number {
    return this.#generation;
  }

  get inFlightCount(): number {
    return this.#inFlight.size;
  }

  /**
   * Begin a new backend generation, abandoning every request the previous one owned.
   *
   * Nothing is answered on the way out: the process that asked is gone, and its `BuilderRpc` went with it.
   */
  startGeneration(): number {
    this.#generation += 1;
    this.#inFlight.clear();
    return this.#generation;
  }

  /** The request to forward to the builder, carrying this host's id in place of the backend's. */
  issue<T extends BuilderRequest>(message: T): T {
    const id = this.#nextId++;
    this.#inFlight.set(id, { backendId: message.id, generation: this.#generation });
    return { ...message, id };
  }

  /** Give an id back when the send failed, so the caller answers the backend itself. */
  withdraw(id: number): void {
    this.#inFlight.delete(id);
  }

  /**
   * The response to forward to the backend with its own id restored, or `null` when no live backend is
   * waiting for it — either it was never issued or the generation that issued it has been replaced.
   */
  settle<T extends BuilderResponse>(message: T): T | null {
    const request = this.#inFlight.get(message.id);
    if (!request) return null;
    this.#inFlight.delete(message.id);
    if (request.generation !== this.#generation) return null;
    return { ...message, id: request.backendId };
  }
}
