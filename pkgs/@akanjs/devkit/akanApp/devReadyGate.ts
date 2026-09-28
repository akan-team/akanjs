import type { DevHostState } from "./devHostPolicy";

//* An app's first ready waits for its SSR registry's boot build to settle: that build's worker is the largest process
//* of a boot, and the supervisor starts the next boot wave (and opens the browser) on the ready. Once it has settled
//* for the session, every state passes straight through.
export class DevReadyGate {
  readonly #forward: (state: DevHostState, detail?: string) => void;
  readonly #waitMs: number;
  #armed = false;
  #held: { detail?: string } | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;

  /** `waitMs` bounds the hold: a builder that never arms (a degraded boot waiting for a fix) must not stall the waves. */
  constructor(forward: (state: DevHostState, detail?: string) => void, { waitMs = 30_000 }: { waitMs?: number } = {}) {
    this.#forward = forward;
    this.#waitMs = waitMs;
  }

  report(state: DevHostState, detail?: string): void {
    if (state === "ready" && !this.#armed) {
      this.#held = { detail };
      if (!this.#timer) {
        this.#timer = setTimeout(() => this.armed(), this.#waitMs);
        this.#timer.unref?.();
      }
      return;
    }
    if (state !== "ready") this.#held = null;
    this.#forward(state, detail);
  }

  armed(): void {
    if (this.#armed) return;
    this.#armed = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    const held = this.#held;
    this.#held = null;
    if (held) this.#forward("ready", held.detail);
  }
}
