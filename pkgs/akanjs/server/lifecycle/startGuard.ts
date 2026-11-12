import type { Logger } from "akanjs/common";

interface StartStep {
  stop: PromiseWithResolvers<void> | null;
}

export class StartGuard {
  readonly #logger: Logger;
  readonly #teardown: () => Promise<void>;
  #step: StartStep | null = null;
  #stopping: Promise<void> | null = null;

  constructor(logger: Logger, teardown: () => Promise<void>) {
    this.#logger = logger;
    this.#teardown = teardown;
  }

  get stopHeld() {
    return Boolean(this.#step?.stop);
  }

  stop(stoppable: () => boolean): Promise<void> {
    return this.#once(async () => {
      //? A start step tears down once its await settles; a teardown under it would be outrun by what it starts next.
      if (this.#step) {
        this.#step.stop ??= Promise.withResolvers<void>();
        return await this.#step.stop.promise;
      }
      if (stoppable()) await this.#teardown();
      else this.#logger.warn("AkanServer is not running. Cannot stop.");
    });
  }

  async stoppedDuring(run: () => Promise<unknown>) {
    const step: StartStep = { stop: null };
    this.#step = step;
    try {
      await run();
    } finally {
      this.#step = null;
      if (step.stop) await this.#teardown().then(step.stop.resolve, step.stop.reject);
    }
    return step.stop !== null;
  }

  async unwound<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      //? Shares a stop already under way rather than destroying again; the teardown logs its own failure.
      await this.#once(this.#teardown).catch(() => undefined);
      throw error;
    }
  }

  #once(run: () => Promise<void>) {
    this.#stopping ??= run().finally(() => {
      this.#stopping = null;
    });
    return this.#stopping;
  }
}
