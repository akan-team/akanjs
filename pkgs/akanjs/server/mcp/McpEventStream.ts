/**
 * One `text/event-stream` response carrying the notifications a single request produced, ending with that
 * request's own result.
 *
 * This is the only channel a server has for pushing anything: `2026-07-28` removed the GET stream, session
 * resumption and server-initiated requests, so nothing may be sent that is not related to a request in flight.
 * Closing the stream is also how the client cancels — `notifications/cancelled` is stdio-only — which is why
 * `cancel` is a constructor argument rather than something a caller could forget to wire.
 */
export class McpEventStream {
  /** Below any common proxy idle timeout, so a slow tool does not have its connection reaped mid-work. */
  static readonly keepAliveMs = 15_000;

  readonly #encoder = new TextEncoder();
  readonly #stream: ReadableStream<Uint8Array>;
  #controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  #keepAlive: ReturnType<typeof setInterval> | null = null;

  constructor(onCancel: () => void) {
    this.#stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.#controller = controller;
        this.#keepAlive = setInterval(() => this.#enqueue(":\r\n"), McpEventStream.keepAliveMs);
        // A pending interval would otherwise hold the process open past the last request.
        this.#keepAlive.unref?.();
      },
      cancel: () => {
        this.#stopKeepAlive();
        this.#controller = null;
        onCancel();
      },
    });
  }

  response() {
    return new Response(this.#stream, {
      headers: {
        "content-type": "text/event-stream",
        // `no-transform` and the nginx hint together stop an intermediary from buffering the stream into one
        // response, which would deliver every progress event at the moment the work already finished.
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  }

  write(message: object) {
    this.#enqueue(`data: ${JSON.stringify(message)}\n\n`);
  }

  close() {
    this.#stopKeepAlive();
    const controller = this.#controller;
    this.#controller = null;
    try {
      controller?.close();
    } catch {
      // The same race `#enqueue` guards, and closing loses it the same way: the client went away between the
      // cancel callback and this call. Nothing is left to close, and nobody is left to tell.
    }
  }

  #enqueue(chunk: string) {
    if (!this.#controller) return;
    try {
      this.#controller.enqueue(this.#encoder.encode(chunk));
    } catch {
      // The client went away between the cancel callback and this write. There is nobody left to tell.
      this.#stopKeepAlive();
      this.#controller = null;
    }
  }

  #stopKeepAlive() {
    if (this.#keepAlive) clearInterval(this.#keepAlive);
    this.#keepAlive = null;
  }
}
