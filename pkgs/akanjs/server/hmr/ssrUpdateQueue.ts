import type { SsrUpdatedPayload } from "../artifact";
import type { HmrMessage } from "./wsHub";

export type SsrUpdateMessage = Extract<HmrMessage, { type: "ssr-update" }>;

interface HeldUpdate {
  message: SsrUpdateMessage;
  hold: boolean;
  batchGeneration?: number;
}

//* Holds an SSR registry patch whose save also changed what the server renders until that save's pages build lands,
//* so a tab applies the patch and refetches RSC together instead of running new client code on old server props for
//* the length of a pages build. A patch queued behind a held one waits too: a tab reloads on a generation gap.
export class SsrUpdateQueue {
  readonly #send: (message: SsrUpdateMessage) => void;
  readonly #maxHoldMs: number;
  readonly #held: HeldUpdate[] = [];
  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor(send: (message: SsrUpdateMessage) => void, { maxHoldMs = 15_000 }: { maxHoldMs?: number } = {}) {
    this.#send = send;
    this.#maxHoldMs = maxHoldMs;
  }

  get size(): number {
    return this.#held.length;
  }

  push(update: SsrUpdatedPayload): void {
    const message: SsrUpdateMessage = {
      type: "ssr-update",
      generation: update.generation,
      url: update.patchUrl,
      changedIds: update.changedIds,
      reload: update.reload,
      reason: update.reason,
      trace: update.trace,
    };
    if (update.reload) {
      this.clear();
      this.#send(message);
      return;
    }
    if (!update.hold && this.#held.length === 0) {
      this.#send(message);
      return;
    }
    this.#held.push({ message, hold: !!update.hold, batchGeneration: update.batchGeneration });
    this.#timer ??= setTimeout(() => this.#releaseAll(), this.#maxHoldMs);
  }

  /** The pages batch of `generation` finished or failed: sends what it covers and everything queued behind that. */
  release(generation: number | undefined): number {
    let released = 0;
    for (let next = this.#held[0]; next; next = this.#held[0]) {
      const waiting = next.hold && next.batchGeneration !== undefined && (generation ?? -1) < next.batchGeneration;
      if (waiting) break;
      this.#held.shift();
      this.#send(next.message);
      released += 1;
    }
    if (this.#held.length === 0) this.#stopTimer();
    return released;
  }

  /** Drops what is held: the tabs are about to reload onto the newest registry anyway. */
  clear(): void {
    this.#held.length = 0;
    this.#stopTimer();
  }

  //? A pages build that never reports (a worker killed mid-batch) must not strand client edits behind it.
  #releaseAll(): void {
    this.#timer = null;
    for (const { message } of this.#held.splice(0)) this.#send(message);
  }

  #stopTimer(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }
}
