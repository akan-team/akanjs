import { AsyncLocalStorage } from "node:async_hooks";

export interface McpProgressOption {
  /** Denominator for the ratio a client renders. Omit when the amount of work is not known up front. */
  total?: number;
  /** One short line describing the current step. Shown to the user, so keep it prose rather than a status code. */
  message?: string;
}

export interface McpProgressReport extends McpProgressOption {
  progress: number;
}

/**
 * The progress channel for one streamed MCP call.
 *
 * Reached through `AsyncLocalStorage` rather than a parameter so an endpoint reports progress from wherever the
 * work actually happens — a service, an adapter, a loop several frames down — without every signature between
 * here and there growing a channel argument. Outside a streamed call `report` is a no-op, so the same endpoint
 * code runs unchanged over plain HTTP, a websocket, or a test.
 */
export class McpProgress {
  static readonly #storage = new AsyncLocalStorage<McpProgress>();

  /**
   * Reports progress for the call running on this stack. Silent when nothing is listening, which is every call
   * that did not ask for a stream.
   */
  static report(progress: number, option: McpProgressOption = {}) {
    const channel = McpProgress.#storage.getStore();
    if (channel) channel.#push(progress, option);
  }

  /** True while the caller is streaming, so an expensive progress message can be skipped when nobody reads it. */
  static get streaming() {
    return !!McpProgress.#storage.getStore();
  }

  static async run<T>(channel: McpProgress, exec: () => Promise<T>): Promise<T> {
    return await McpProgress.#storage.run(channel, exec);
  }

  readonly #queue: McpProgressReport[] = [];
  readonly #abort = new AbortController();
  #wake: (() => void) | null = null;
  #start: (() => void) | null = null;
  #ended = false;

  /** Resolves on the first report and never otherwise — a call that reports nothing has nothing to stream. */
  readonly started: Promise<void>;

  constructor() {
    this.started = new Promise<void>((resolve) => {
      this.#start = resolve;
    });
  }

  /**
   * Aborted when the client closes the response stream, which is how cancellation is signalled over this
   * transport. Long-running work may watch it; the framework cannot force an `exec` already in flight to stop.
   */
  get signal() {
    return this.#abort.signal;
  }

  /** Yields every report until the call finishes. Buffered ones come out first, so none is lost to a late reader. */
  async *reports(): AsyncGenerator<McpProgressReport> {
    // A report pushed in the same tick the call finished is still owed to the client, so the queue keeps the
    // loop alive past `end()`.
    // biome-ignore lint/suspicious/noUnnecessaryConditions: `end()` flips `#ended` from outside this generator while it is suspended in `yield`, which the analysis cannot see.
    while (!this.#ended || this.#queue.length) {
      for (const report of this.#queue.splice(0)) yield report;
      // Re-checked before parking, because the consumer is suspended inside `yield` above for as long as it takes
      // to write the event out — and a report pushed during that window finds `#wake` still unset and wakes
      // nobody. Parking on it anyway would hold that report until whatever came next, in practice the end of the
      // call: the whole latency a progress stream exists to remove.
      // biome-ignore lint/suspicious/noUnnecessaryConditions: same as above — both operands change while this generator is suspended.
      if (this.#ended || this.#queue.length) continue;
      await new Promise<void>((resolve) => {
        this.#wake = resolve;
      });
    }
  }

  end() {
    this.#ended = true;
    this.#release();
  }

  abort() {
    this.#abort.abort();
    this.end();
  }

  #push(progress: number, { total, message }: McpProgressOption) {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: a report can arrive after `end()`; dropping it is the point.
    if (this.#ended) return;
    this.#queue.push({
      progress,
      ...(total === undefined ? {} : { total }),
      ...(message ? { message } : {}),
    });
    this.#start?.();
    this.#start = null;
    this.#release();
  }

  #release() {
    this.#wake?.();
    this.#wake = null;
  }
}
