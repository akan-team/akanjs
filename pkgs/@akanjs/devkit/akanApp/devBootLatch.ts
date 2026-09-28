//* An app's boot is over for the supervisor once it serves and its builder's boot builds have settled (the SSR
//* registry's, and CSR's when the env arms it): those workers are a boot's largest processes, so the next boot wave
//* starts here, while the browser opens on the ready that comes first.
export class DevBootLatch {
  readonly #onBooted: () => void;
  readonly #waitMs: number;
  #ready = false;
  #armed = false;
  #booted = false;
  #timer: ReturnType<typeof setTimeout> | null = null;

  /** `waitMs` bounds the wait past ready: a builder that never reports (killed mid-boot) must not stall the waves. */
  constructor(onBooted: () => void, { waitMs = 30_000 }: { waitMs?: number } = {}) {
    this.#onBooted = onBooted;
    this.#waitMs = waitMs;
  }

  ready(): void {
    this.#ready = true;
    if (!this.#armed && !this.#timer) {
      this.#timer = setTimeout(() => this.armed(), this.#waitMs);
      this.#timer.unref?.();
    }
    this.#release();
  }

  armed(): void {
    this.#armed = true;
    this.#release();
  }

  #release(): void {
    if (this.#booted || !this.#ready || !this.#armed) return;
    this.#booted = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.#onBooted();
  }
}
