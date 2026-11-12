import type { RedirectStatus } from "akanjs/client";
import type { Logger } from "akanjs/common";
import { type AkanTheme, getRequestTheme } from "akanjs/fetch";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-server-dom-webpack/server.node";
import { getCurrentTrace } from "../signal/trace";
import type { ClientManifest } from "./artifact";
import type { RouteCacheRenderState } from "./cachePolicy";
import { RouteElementComposer } from "./routeElementComposer";
import type { RouteShellGate } from "./routeShellGate";
import { concatBytes, encodeAkanRedirectDigest } from "./rscHttp";
import { isAkanNotFoundError, isAkanRedirectError } from "./rscRenderControl";
import type { RscTraceMetadata } from "./ssrTypes";

//? Declared beside its `type` checks: on a tie with `RscInMsg`, the framework map's channel reader keeps a local union.
export type RenderControl =
  | { type: "redirect"; location: string; method: "replace" | "push"; status: RedirectStatus }
  | { type: "not-found" }
  | { type: "error"; error: unknown };

export interface FlightRenderResult {
  chunks: Uint8Array[];
  bytes: number;
  chunksCount: number;
  control: RenderControl | null;
  lateControlSent: boolean;
  cancelled: boolean;
}

export interface FlightRenderOptions {
  requestId?: string;
  collectChunks?: boolean;
  status?: number;
  trace?: RscTraceMetadata;
  /** Raised by a render that answered `router.notFound()` in place, which React never reports as an error. */
  notFoundProbe?: { hit: boolean };
  gate?: RouteShellGate;
  onComplete?: (
    result: Omit<FlightRenderResult, "cancelled">,
  ) => Promise<RouteCacheRenderState> | RouteCacheRenderState;
}

interface RscFlightStreamProps {
  logger: Logger;
  send: (message: unknown) => void;
  isCancelled: (requestId: string) => boolean;
  track: (requestId: string, reader: ReadableStreamDefaultReader<Uint8Array>) => void;
  untrack: (requestId: string) => void;
  reportRenderError: (error: unknown, pathname?: string) => string;
}

export class RscFlightStream {
  readonly #props: RscFlightStreamProps;
  readonly #options: FlightRenderOptions;
  readonly #controlRef: { current: RenderControl | null } = { current: null };
  //? Cancelling a Flight stream aborts each pending task through `onError`; the control that cancelled it stands.
  #isCancelling: boolean = false;
  #bytes = 0;
  #chunksCount = 0;
  #sentMeta: boolean = false;
  #sentChunk: boolean = false;
  #lateControlSent: boolean = false;
  readonly #chunks: Uint8Array[] = [];
  //? Held until the levels above the first `.loading()` settle, so an error they throw still gets its `.error()`.
  #holding: RouteShellGate | null = null;
  #held: Uint8Array | null = null;
  #reportedTheme: AkanTheme | undefined;

  constructor(props: RscFlightStreamProps, options: FlightRenderOptions) {
    this.#props = props;
    this.#options = options;
  }

  async render(element: ReactNode, clientManifest: ClientManifest): Promise<FlightRenderResult> {
    const options = this.#options;
    const stream = await renderToReadableStream(element, clientManifest, {
      onError: (error) => this.#onError(error),
    });
    const reader = stream.getReader();
    if (options.requestId) this.#props.track(options.requestId, reader);
    this.#holding = options.gate?.holding ? options.gate : null;
    try {
      let pendingRead: ReturnType<typeof reader.read> | null = null;
      for (;;) {
        if (options.requestId && this.#props.isCancelled(options.requestId))
          return await this.#cancelWith(reader, null, true);
        pendingRead ??= reader.read();
        const holding = this.#holding;
        if (holding && (await Promise.race([pendingRead.then(() => false), holding.opened.then(() => true)]))) {
          this.#readProbe();
          if (this.#controlRef.current?.type === "error")
            return await this.#cancelWith(reader, this.#controlRef.current, false);
          this.#releaseHeld();
          continue;
        }
        const { value, done } = await pendingRead;
        pendingRead = null;
        this.#readProbe();
        if (
          this.#controlRef.current &&
          !this.#sentChunk &&
          (!this.#holding || this.#controlRef.current.type === "error")
        )
          return await this.#cancelWith(reader, this.#controlRef.current, false);
        if (this.#controlRef.current && this.#sentChunk) this.#sendLateControl();
        if (done) break;
        //? Flight writes its first row before an async render settles; held one task, a redirect or not-found the body
        //? raised with no I/O awaited still leaves before any byte, as a real status.
        if (this.#chunksCount === 0 && options.requestId) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          this.#readProbe();
          if (this.#controlRef.current) return await this.#cancelWith(reader, this.#controlRef.current, false);
        }
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBufferLike);
        this.#bytes += chunk.byteLength;
        this.#chunksCount += 1;
        if (this.#holding) this.#held = this.#held ? concatBytes(this.#held, chunk) : chunk;
        else this.#emit(chunk);
      }
    } catch (error) {
      if (options.requestId && this.#props.isCancelled(options.requestId)) {
        return this.#resultOf(null, true);
      }
      throw error;
    } finally {
      if (options.requestId) this.#props.untrack(options.requestId);
      reader.releaseLock();
    }
    this.#readProbe();
    if (this.#holding && this.#controlRef.current?.type !== "error") this.#releaseHeld();
    if (this.#controlRef.current && this.#sentChunk) this.#sendLateControl();
    if (this.#controlRef.current && !this.#sentChunk) return this.#resultOf(this.#controlRef.current, false);
    if (options.requestId) {
      this.#sendMeta();
      const cacheState = (await options.onComplete?.({
        chunks: this.#chunks,
        bytes: this.#bytes,
        chunksCount: this.#chunksCount,
        control: this.#controlRef.current,
        lateControlSent: this.#lateControlSent,
      })) ?? { cacheable: false, reason: "uncacheable-render" };
      this.#props.send({ type: "cache-state", requestId: options.requestId, state: cacheState });
      this.#props.send({ type: "end", requestId: options.requestId });
    }
    return this.#resultOf(this.#lateControlSent ? this.#controlRef.current : null, false);
  }

  #onError(error: unknown): string | undefined {
    const options = this.#options;
    if (this.#isCancelling || (options.requestId && this.#props.isCancelled(options.requestId))) return;
    if (isAkanRedirectError(error)) {
      const { location, method, status } = error;
      this.#controlRef.current = { type: "redirect", location, method, status };
      return encodeAkanRedirectDigest({ location, method, status });
    }
    if (isAkanNotFoundError(error)) {
      this.#controlRef.current = { type: "not-found" };
      return error.digest;
    }
    if (!RouteElementComposer.streamed(error)) this.#controlRef.current = { type: "error", error };
    return this.#props.reportRenderError(error, options.trace?.pathname);
  }

  #resultOf(control: RenderControl | null, cancelled: boolean): FlightRenderResult {
    return {
      chunks: this.#chunks,
      bytes: this.#bytes,
      chunksCount: this.#chunksCount,
      control,
      lateControlSent: this.#lateControlSent,
      cancelled,
    };
  }

  #sendMeta(): void {
    const options = this.#options;
    if (!options.requestId || this.#sentMeta) return;
    this.#sentMeta = true;
    if (options.status !== undefined) {
      const trace = getCurrentTrace();
      if (trace) trace.status = options.status;
    }
    this.#reportedTheme = getRequestTheme();
    this.#props.send({
      type: "meta",
      requestId: options.requestId,
      theme: this.#reportedTheme,
      status: options.status,
      trace: options.trace,
    });
  }

  //? The provider names the theme when the root layout renders, usually after the first chunk has left; sent ahead of
  //? the chunk carrying it, the host has it before the HTML shell (and its `<html data-theme>`) can be written.
  #sendLateTheme(): void {
    const options = this.#options;
    const theme = getRequestTheme();
    if (!options.requestId || !this.#sentMeta || theme === this.#reportedTheme) return;
    this.#reportedTheme = theme;
    this.#props.send({ type: "theme", requestId: options.requestId, theme });
  }

  async #cancelWith(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    control: RenderControl | null,
    cancelled: boolean,
  ): Promise<FlightRenderResult> {
    this.#isCancelling = true;
    await reader.cancel();
    return this.#resultOf(control, cancelled);
  }

  #readProbe(): void {
    if (!this.#controlRef.current && this.#options.notFoundProbe?.hit) this.#controlRef.current = { type: "not-found" };
  }

  #emit(chunk: Uint8Array): void {
    const options = this.#options;
    if (options.collectChunks) this.#chunks.push(chunk);
    if (!options.requestId) return;
    this.#sendMeta();
    this.#sendLateTheme();
    this.#props.send({ type: "chunk", requestId: options.requestId, data: chunk });
    this.#sentChunk = true;
  }

  #releaseHeld(): void {
    this.#holding = null;
    if (!this.#held) return;
    if (this.#controlRef.current) {
      this.#sendMeta();
      this.#sendLateControl();
    }
    this.#emit(this.#held);
    this.#held = null;
  }

  // Once bytes have left the status is the host's to decide: a redirect becomes a navigation, a not-found a 404 only
  // where the host still holds the response (a held level, a blocking or crawler render). An error stays in React's.
  #sendLateControl(): void {
    const options = this.#options;
    const control = this.#controlRef.current;
    if (!options.requestId || this.#lateControlSent || !control || control.type === "error") return;
    this.#lateControlSent = true;
    if (control.type === "redirect") {
      this.#props.send({
        type: "late-redirect",
        requestId: options.requestId,
        location: control.location,
        method: control.method,
        status: control.status,
      });
      return;
    }
    if (!options.notFoundProbe?.hit)
      this.#props.logger.warn(
        `render[${options.requestId}] not-found raised below a route render after the stream started; that subtree renders nothing — call router.notFound() from the page or layout body`,
      );
    this.#props.send({ type: "late-not-found", requestId: options.requestId });
  }
}
