import type { Logger } from "akanjs/common";
import type { ReactNode } from "react";
import type { ClientManifest } from "./artifact";
import { type FlightRenderOptions, type FlightRenderResult, RscFlightStream } from "./rscFlightStream";

export class RscFlightRenderer {
  readonly #logger: Logger;
  readonly #send: (message: unknown) => void;
  readonly #activeRenderReaders = new Map<string, ReadableStreamDefaultReader<Uint8Array>>();
  readonly #cancelledRenderRequests = new Set<string>();

  constructor(logger: Logger, send: (message: unknown) => void) {
    this.#logger = logger;
    this.#send = send;
  }

  renderFlightElement(
    element: ReactNode,
    clientManifest: ClientManifest,
    options: FlightRenderOptions = {},
  ): Promise<FlightRenderResult> {
    const stream = new RscFlightStream(
      {
        logger: this.#logger,
        send: this.#send,
        isCancelled: (requestId) => this.#cancelledRenderRequests.has(requestId),
        track: (requestId, reader) => this.#activeRenderReaders.set(requestId, reader),
        untrack: (requestId) => this.#activeRenderReaders.delete(requestId),
        reportRenderError: (error, pathname) => this.#reportRenderError(error, pathname),
      },
      options,
    );
    return stream.render(element, clientManifest);
  }

  isCancelled(requestId: string): boolean {
    return this.#cancelledRenderRequests.has(requestId);
  }

  handleCancel(requestId: string): void {
    this.#cancelledRenderRequests.add(requestId);
    const reader = this.#activeRenderReaders.get(requestId);
    if (!reader) return;
    void reader.cancel().catch(() => {
      // Best-effort: the render loop also checks `#cancelledRenderRequests` before sending more chunks.
    });
  }

  release(requestId: string): void {
    this.#activeRenderReaders.delete(requestId);
    this.#cancelledRenderRequests.delete(requestId);
  }

  // Past the first Flight chunk only a late redirect reaches the host, so this log is the only record of the failure.
  //? Security: React sends the returned digest to the browser, and a thrown message can quote a statement's row data.
  #reportRenderError(error: unknown, pathname?: string): string {
    const message = error instanceof Error ? error.message : String(error);
    const description = error instanceof Error ? (error.stack ?? message) : message;
    const opaque = process.env.NODE_ENV === "production";
    const digest = opaque ? crypto.randomUUID().slice(0, 8) : message || "AKAN_RENDER_ERROR";
    const scope = `${pathname ? ` path=${pathname}` : ""}${opaque ? ` digest=${digest}` : ""}`;
    if (RscFlightRenderer.#isExpectedRequestAbort(error))
      this.#logger.debug(`[rsc] render aborted${scope}: ${description}`);
    else this.#logger.error(`[rsc] render failed${scope}: ${description}`);
    return digest;
  }

  static #isExpectedRequestAbort(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return (
      error.name === "AbortError" ||
      error.message === "Connection closed." ||
      error.message.includes("The connection was closed")
    );
  }
}
