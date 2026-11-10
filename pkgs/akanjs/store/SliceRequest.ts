import { AbortSignals } from "akanjs/common";
import { HttpClient } from "akanjs/fetch";

/** Which of a slice's list requests is current: claiming a new one aborts the older, whose answer would be dropped. */
export class SliceRequest {
  #latest = 0;
  #controller: AbortController | null = null;
  readonly #httpOf: () => HttpClient | undefined;

  constructor(httpOf: () => HttpClient | undefined = () => undefined) {
    this.#httpOf = httpOf;
  }

  claim(callerSignal?: AbortSignal) {
    this.#controller?.abort();
    this.#controller = new AbortController();
    this.#latest += 1;
    const ownSignal = this.#controller.signal;
    const joined = AbortSignals.join([ownSignal, callerSignal]);
    return {
      ticket: this.#latest,
      signal: joined.signal ?? ownSignal,
      dispose: joined.dispose,
      //? A caller's timeout fails its load as a query's own deadline does; any other abort ends it with no write.
      endsQuietly: () => ownSignal.aborted || (!!callerSignal?.aborted && !AbortSignals.isTimeout(callerSignal)),
    };
  }

  isCurrent(ticket: number): boolean {
    return ticket === this.#latest;
  }

  endSpent(callerSignal: AbortSignal) {
    if (!AbortSignals.isTimeout(callerSignal)) return;
    throw this.#httpOf()?.abortError(callerSignal) ?? HttpClient.abortErrorOf(callerSignal);
  }
}
