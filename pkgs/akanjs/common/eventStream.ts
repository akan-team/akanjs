export interface EventStreamOptions {
  keepAliveMs?: number;
  /** What the keep-alive sends; a line starting with `:` is a comment every SSE client discards. */
  keepAliveChunk?: string;
  /** Past this many queued bytes `write` drops and counts; the reader gets `{ type: "dropped", count }` on resuming. */
  maxQueuedBytes?: number;
  /** Drops in one stall past which the stream is errored and `onCancel` runs. */
  maxDropped?: number;
}

// The keep-alive interval stays below common proxy idle timeouts so a quiet stream is not reaped.
export class EventStream {
  static readonly defaultKeepAliveMs = 15_000;

  readonly #encoder = new TextEncoder();
  readonly #stream: ReadableStream<Uint8Array>;
  #controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  #keepAlive: ReturnType<typeof setInterval> | null = null;
  readonly #onCancel: () => void;
  readonly #maxQueuedBytes: number | null;
  readonly #maxDropped: number | null;
  #dropped = 0;

  constructor(
    onCancel: () => void,
    {
      keepAliveMs = EventStream.defaultKeepAliveMs,
      keepAliveChunk = ":\r\n",
      maxQueuedBytes,
      maxDropped,
    }: EventStreamOptions = {},
  ) {
    this.#onCancel = onCancel;
    this.#maxQueuedBytes = maxQueuedBytes && maxQueuedBytes > 0 ? maxQueuedBytes : null;
    this.#maxDropped = this.#maxQueuedBytes && maxDropped !== undefined && maxDropped >= 0 ? maxDropped : null;
    this.#stream = new ReadableStream<Uint8Array>(
      {
        start: (controller) => {
          this.#controller = controller;
          this.#keepAlive = setInterval(() => this.#enqueue(keepAliveChunk, false), keepAliveMs);
          // A pending interval would otherwise hold the process open past the last request.
          this.#keepAlive.unref?.();
        },
        pull: () => this.#reportDropped(),
        cancel: () => {
          this.#stopKeepAlive();
          this.#controller = null;
          onCancel();
        },
      },
      this.#maxQueuedBytes ? new ByteLengthQueuingStrategy({ highWaterMark: this.#maxQueuedBytes }) : undefined,
    );
  }

  get open() {
    return this.#controller !== null;
  }

  response(headers: { [key: string]: string } = {}) {
    return new Response(this.#stream, {
      headers: {
        "content-type": "text/event-stream",
        // `no-transform` and the nginx hint stop an intermediary from buffering the stream into one response.
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
        ...headers,
      },
    });
  }

  write(message: object, id?: string | number) {
    this.#enqueue(`${id === undefined ? "" : `id: ${id}\n`}data: ${JSON.stringify(message)}\n\n`, true);
  }

  comment(text: string) {
    this.#enqueue(`: ${text}\n\n`, false);
  }

  retry(ms: number) {
    this.#enqueue(`retry: ${ms}\n\n`, false);
  }

  close() {
    this.#stopKeepAlive();
    const controller = this.#controller;
    this.#controller = null;
    try {
      controller?.close();
    } catch {
      // The client went away between the cancel callback and this call.
    }
  }

  #enqueue(chunk: string, counted: boolean) {
    const controller = this.#controller;
    if (!controller) return;
    const bytes = this.#encoder.encode(chunk);
    if (this.#overflows(controller, bytes.byteLength)) {
      if (counted) this.#drop();
      return;
    }
    try {
      controller.enqueue(bytes);
    } catch {
      // The client went away between the cancel callback and this write.
      this.#stopKeepAlive();
      this.#controller = null;
    }
  }

  #overflows(controller: ReadableStreamDefaultController<Uint8Array>, bytes: number) {
    const max = this.#maxQueuedBytes;
    if (!max) return false;
    const queued = max - (controller.desiredSize ?? max);
    return this.#dropped > 0 || (queued > 0 && queued + bytes > max);
  }

  #drop() {
    this.#dropped += 1;
    if (this.#maxDropped === null || this.#dropped <= this.#maxDropped) return;
    const controller = this.#controller;
    this.#stopKeepAlive();
    this.#controller = null;
    // `error` discards the queue a stalled reader holds, where `close` would keep it until read.
    controller?.error(new Error(`event stream reader stalled past ${this.#maxDropped} dropped events`));
    this.#onCancel();
  }

  #reportDropped() {
    const controller = this.#controller;
    if (!controller || !this.#dropped) return;
    const count = this.#dropped;
    this.#dropped = 0;
    controller.enqueue(this.#encoder.encode(`data: ${JSON.stringify({ type: "dropped", count })}\n\n`));
  }

  #stopKeepAlive() {
    if (this.#keepAlive) clearInterval(this.#keepAlive);
    this.#keepAlive = null;
  }
}
