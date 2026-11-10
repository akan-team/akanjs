import { Backoff, type BackoffPolicy } from "./backoff";

export interface RestartPolicy extends BackoffPolicy {
  maxAttempts?: number;
}

export class RestartSchedule {
  readonly #policy: RestartPolicy;
  #attempts = 0;
  #timer: ReturnType<typeof setTimeout> | null = null;

  //? No jitter by default: a schedule restarts one local process, so there is no herd of callers to spread apart.
  constructor({ jitter = 0, ...policy }: RestartPolicy = {}) {
    this.#policy = { ...policy, jitter };
  }

  get attempts() {
    return this.#attempts;
  }

  get pending() {
    return this.#timer !== null;
  }

  get exhausted() {
    return this.#policy.maxAttempts !== undefined && this.#attempts >= this.#policy.maxAttempts;
  }

  next() {
    this.#attempts += 1;
    return Backoff.delay(this.#attempts, this.#policy);
  }

  arm(delay: number, run: () => void) {
    this.cancel();
    this.#timer = setTimeout(() => {
      this.#timer = null;
      run();
    }, delay);
  }

  schedule(run: () => void) {
    const delay = this.next();
    this.arm(delay, run);
    return delay;
  }

  cancel() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  reset() {
    this.#attempts = 0;
  }
}
