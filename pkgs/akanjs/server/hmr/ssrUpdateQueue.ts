import type { SsrUpdatedPayload } from "../artifact";
import type { HmrMessage } from "./wsHub";

export type SsrUpdateMessage = Extract<HmrMessage, { type: "ssr-update" }>;

interface HeldUpdate {
  message: SsrUpdateMessage;
  hold: boolean;
  batchGeneration?: number;
  heldAt: number;
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
    const entry: HeldUpdate = {
      message,
      hold: !!update.hold,
      batchGeneration: update.batchGeneration,
      heldAt: Date.now(),
    };
    //? A reload supersedes every patch ahead of it and inherits their holds: the reloaded page renders from the pages
    //? bundle, which must hold the newest save that changed server output, not only the reload's own.
    if (update.reload) {
      for (const held of this.#held.splice(0)) {
        if (!held.hold) continue;
        entry.hold = true;
        entry.heldAt = Math.min(entry.heldAt, held.heldAt);
        if (held.batchGeneration !== undefined)
          entry.batchGeneration = Math.max(entry.batchGeneration ?? held.batchGeneration, held.batchGeneration);
      }
    }
    if (!entry.hold && this.#held.length === 0) {
      this.#stopTimer();
      this.#send(message);
      return;
    }
    this.#held.push(entry);
    this.#arm();
  }

  /**
   * The pages batch of `generation` finished or failed: sends what it covers and everything queued behind that, and
   * says whether a reload went out (the tabs then need no RSC refresh).
   */
  release(generation: number | undefined): { released: number; reload: boolean } {
    return this.#shift((held) => !this.#waitsPast(held, generation), true);
  }

  /** Drops what the pages batch of `generation` covers, or everything without one: the tabs are about to reload. */
  clear(generation?: number): void {
    if (generation === undefined) this.#held.length = 0;
    else this.#shift((held) => !this.#waitsPast(held, generation), false);
    this.#arm();
  }

  #waitsPast(held: HeldUpdate, generation: number | undefined): boolean {
    return held.hold && held.batchGeneration !== undefined && (generation ?? -1) < held.batchGeneration;
  }

  #shift(due: (held: HeldUpdate) => boolean, send: boolean): { released: number; reload: boolean } {
    let released = 0;
    let reload = false;
    for (let next = this.#held[0]; next && due(next); next = this.#held[0]) {
      this.#held.shift();
      if (send) this.#send(next.message);
      released += 1;
      reload ||= !!next.message.reload;
    }
    this.#arm();
    return { released, reload };
  }

  //? A pages build that never reports (a worker killed mid-batch) must not strand client edits behind it. Each held
  //? patch waits at most that long from when it was held, so a partial release re-arms for the one now at the head.
  #arm(): void {
    this.#stopTimer();
    const head = this.#held[0];
    if (!head) return;
    const delay = Math.max(0, head.heldAt + this.#maxHoldMs - Date.now());
    this.#timer = setTimeout(() => {
      this.#timer = null;
      const now = Date.now();
      this.#shift((held) => !held.hold || now - held.heldAt >= this.#maxHoldMs, true);
    }, delay);
  }

  #stopTimer(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }
}
