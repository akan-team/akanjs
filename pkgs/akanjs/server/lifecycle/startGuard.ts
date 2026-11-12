import { AsyncLocalStorage } from "node:async_hooks";
import type { Logger } from "akanjs/common";

interface StartStep {
  stop: PromiseWithResolvers<void> | null;
}

export class StartGuard {
  //? Not a flag set around the step: it would also take a stop from outside, landing meanwhile, for the step's own.
  static readonly #caller = new AsyncLocalStorage<StartStep>();
  readonly #logger: Logger;
  readonly #teardown: () => Promise<void>;
  #step: StartStep | null = null;
  #stopping: Promise<void> | null = null;
  #teardowns = 0;

  constructor(logger: Logger, teardown: () => Promise<void>) {
    this.#logger = logger;
    this.#teardown = async () => {
      try {
        await teardown();
      } finally {
        this.#teardowns += 1;
      }
    };
  }

  static outside<T>(run: () => T): T {
    return StartGuard.#caller.exit(run);
  }

  get stopHeld() {
    return Boolean(this.#step?.stop);
  }

  stop(stoppable: () => boolean): Promise<void> {
    const step = this.#step;
    //? From inside the step (an init hook) a stop would wait on itself: it is held for the step's end and settles now.
    if (step && StartGuard.#caller.getStore() === step) {
      step.stop ??= Promise.withResolvers<void>();
      const held = step.stop.promise;
      //? The stop under way, so a later one waits for the step's teardown; nobody here awaits the failure it logs.
      void held.catch(() => undefined);
      void this.#once(() => held).catch(() => undefined);
      return Promise.resolve();
    }
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
      await StartGuard.#caller.run(step, run);
    } finally {
      this.#step = null;
      if (step.stop) await this.#teardown().then(step.stop.resolve, step.stop.reject);
    }
    return step.stop !== null;
  }

  async unwound<T>(run: () => Promise<T>): Promise<T> {
    const teardowns = this.#teardowns;
    try {
      return await run();
    } catch (error) {
      //? A teardown finished since this start began took down what it brought up; one more would hit the start after it.
      if (teardowns !== this.#teardowns) throw error;
      this.#logger.error(`AkanServer failed to start, tearing down: ${error instanceof Error ? error.message : error}`);
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
