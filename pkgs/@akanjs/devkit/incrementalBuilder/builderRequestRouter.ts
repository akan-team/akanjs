import type { BuilderRequest, BuilderResponse } from "akanjs/server";

// `BuilderRpc` numbers from 1 per backend process while the builder outlives backends, so ids collide across a
// restart; host-owned ids keep a dead generation's answer from settling the new backend's request.
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

  // Abandons the previous generation's requests unanswered: the backend that asked is gone.
  startGeneration(): number {
    this.#generation += 1;
    this.#inFlight.clear();
    return this.#generation;
  }

  issue<T extends BuilderRequest>(message: T): T {
    const id = this.#nextId++;
    this.#inFlight.set(id, { backendId: message.id, generation: this.#generation });
    return { ...message, id };
  }

  // For a failed send, after which the caller answers the backend itself.
  withdraw(id: number): void {
    this.#inFlight.delete(id);
  }

  // null when no live backend is waiting: never issued, or its generation was replaced.
  settle<T extends BuilderResponse>(message: T): T | null {
    const request = this.#inFlight.get(message.id);
    if (!request) return null;
    this.#inFlight.delete(message.id);
    if (request.generation !== this.#generation) return null;
    return { ...message, id: request.backendId };
  }
}
