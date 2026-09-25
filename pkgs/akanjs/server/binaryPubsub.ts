import { Logger } from "akanjs/common";

/**
 * Sends binary pubsub frames and absorbs a slow subscriber. `Server.publish` reports `-1` when the socket is
 * backpressured, `0` when the room has no subscriber, and the byte count otherwise — so a room that cannot
 * keep up parks its newest frame here and every earlier one is dropped, rather than queueing behind the
 * slowest subscriber until the send buffer is the stream. Bun fires `drain` per socket when its buffer
 * empties; that is what flushes the parked frames.
 */
export class BinaryPubsub {
  readonly #logger = new Logger("BinaryPubsub");
  readonly #pending = new Map<string, Uint8Array>();
  #servers: Bun.Server<unknown>[] = [];
  #coalescedCount = 0;

  get coalescedCount() {
    return this.#coalescedCount;
  }

  setServers(...servers: (Bun.Server<never> | null)[]) {
    this.#servers = servers.filter((server): server is Bun.Server<never> => !!server) as Bun.Server<unknown>[];
  }

  publish(roomId: string, frame: Uint8Array, { coalesce = false }: { coalesce?: boolean } = {}) {
    if (!this.#send(roomId, frame) || !coalesce) return;
    if (this.#pending.has(roomId)) this.#coalescedCount += 1;
    this.#pending.set(roomId, frame);
  }

  /** Retries every parked room. A room still backpressured re-parks itself and waits for the next drain. */
  flush() {
    if (!this.#pending.size) return;
    for (const [roomId, frame] of [...this.#pending]) {
      this.#pending.delete(roomId);
      if (this.#send(roomId, frame)) this.#pending.set(roomId, frame);
    }
  }

  clear() {
    this.#pending.clear();
  }

  /** True when at least one server refused the frame for backpressure, which is the only case worth parking. */
  #send(roomId: string, frame: Uint8Array): boolean {
    let backpressured = false;
    for (const server of this.#servers) {
      try {
        if (server.publish(roomId, frame) === -1) backpressured = true;
      } catch (error) {
        this.#logger.warn(`Binary publish failed for ${roomId}: ${error instanceof Error ? error.message : error}`);
      }
    }
    return backpressured;
  }
}
